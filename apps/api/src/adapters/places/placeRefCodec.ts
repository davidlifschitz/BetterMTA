import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import type { Place } from "../../types.js";
import { GEOCODER_PROVIDER_ID } from "./types.js";

const PLACE_REF_PREFIX = "pl_geo_v1.";
const PLACE_REF_AAD = Buffer.from("bettermta:geocode-place-ref:v1", "utf8");
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const MAX_TOKEN_LENGTH = 4096;

type GeocodePlaceRefPayload = {
  v: 1;
  e: number;
  l: string;
  k: "address" | "poi";
  a: number;
  o: number;
  b?: string;
  f?: string;
  t?: string;
};

export interface GeocodePlaceRefCodecOptions {
  key: Uint8Array;
  ttlMs: number;
  now?: () => number;
  random?: (size: number) => Buffer;
}

/**
 * Short-lived, authenticated, encrypted PlaceRefs for geocoder results.
 * Every API replica with the same key can resolve a ref without shared storage.
 */
export class GeocodePlaceRefCodec {
  private readonly key: Buffer;
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly random: (size: number) => Buffer;

  constructor(opts: GeocodePlaceRefCodecOptions) {
    this.key = Buffer.from(opts.key);
    if (this.key.length !== 32) {
      throw new Error("Geocode PlaceRef key must be exactly 32 bytes.");
    }
    if (!Number.isSafeInteger(opts.ttlMs) || opts.ttlMs <= 0) {
      throw new Error("Geocode PlaceRef TTL must be a positive integer.");
    }
    this.ttlMs = opts.ttlMs;
    this.now = opts.now ?? (() => Date.now());
    this.random = opts.random ?? randomBytes;
  }

  seal(place: Place): Place {
    assertSealableGeocodePlace(place);
    const payload: GeocodePlaceRefPayload = {
      v: 1,
      e: this.now() + this.ttlMs,
      l: place.label,
      k: place.kind,
      a: place.lat,
      o: place.lon,
      ...(place.borough ? { b: place.borough } : {}),
      ...(place.formattedAddress ? { f: place.formattedAddress } : {}),
      ...(place.attribution ? { t: place.attribution } : {}),
    };
    const iv = this.random(IV_BYTES);
    if (iv.length !== IV_BYTES) {
      throw new Error("Geocode PlaceRef IV source returned an invalid length.");
    }
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(PLACE_REF_AAD);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(payload), "utf8"),
      cipher.final(),
    ]);
    const token = Buffer.concat([iv, ciphertext, cipher.getAuthTag()]).toString(
      "base64url",
    );
    const placeId = `${PLACE_REF_PREFIX}${token}`;
    if (placeId.length > MAX_TOKEN_LENGTH) {
      throw new Error("Geocode PlaceRef exceeds the bounded token length.");
    }
    return {
      placeId,
      label: place.label,
      kind: place.kind,
      lat: place.lat,
      lon: place.lon,
      provider: GEOCODER_PROVIDER_ID,
      ...(place.borough ? { borough: place.borough } : {}),
      ...(place.formattedAddress
        ? { formattedAddress: place.formattedAddress }
        : {}),
      ...(place.attribution ? { attribution: place.attribution } : {}),
    };
  }

  open(placeId: string): Place | null {
    if (
      !placeId.startsWith(PLACE_REF_PREFIX) ||
      placeId.length > MAX_TOKEN_LENGTH
    ) {
      return null;
    }
    const encoded = placeId.slice(PLACE_REF_PREFIX.length);
    if (!/^[A-Za-z0-9_-]+$/.test(encoded)) return null;

    try {
      const packed = Buffer.from(encoded, "base64url");
      if (packed.toString("base64url") !== encoded) return null;
      if (packed.length <= IV_BYTES + AUTH_TAG_BYTES) return null;
      const iv = packed.subarray(0, IV_BYTES);
      const authTag = packed.subarray(packed.length - AUTH_TAG_BYTES);
      const ciphertext = packed.subarray(IV_BYTES, -AUTH_TAG_BYTES);
      const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
      decipher.setAAD(PLACE_REF_AAD);
      decipher.setAuthTag(authTag);
      const plaintext = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]).toString("utf8");
      const payload: unknown = JSON.parse(plaintext);
      if (!isValidPayload(payload, this.now())) return null;

      return {
        placeId,
        label: payload.l,
        kind: payload.k,
        lat: payload.a,
        lon: payload.o,
        provider: GEOCODER_PROVIDER_ID,
        ...(payload.b ? { borough: payload.b } : {}),
        ...(payload.f ? { formattedAddress: payload.f } : {}),
        ...(payload.t ? { attribution: payload.t } : {}),
      };
    } catch {
      return null;
    }
  }
}

/** Decode a deploy secret without ever logging or persisting its value. */
export function decodeGeocodePlaceRefKey(raw: string): Buffer {
  const isStandardBase64 = /^[A-Za-z0-9+/]{43}=$/.test(raw);
  const isBase64Url = /^[A-Za-z0-9_-]{43}=?$/.test(raw);
  if (!isStandardBase64 && !isBase64Url) {
    throw new Error(
      "BETTERMTA_PLACE_REF_KEY must be an exactly 32-byte base64 or base64url value.",
    );
  }
  const decoded = Buffer.from(raw, "base64url");
  if (decoded.length !== 32) {
    throw new Error(
      "BETTERMTA_PLACE_REF_KEY must be an exactly 32-byte base64 or base64url value.",
    );
  }
  return decoded;
}

/** Address/POI production must fail closed instead of emitting process-local refs. */
export function assertProductionPlaceRefKey(
  addressPoiEnabled: boolean,
  rawKey: string | null,
  nodeEnv = process.env.NODE_ENV,
): void {
  if (nodeEnv === "production" && addressPoiEnabled && !rawKey) {
    throw new Error(
      "Refusing to start: BETTERMTA_PLACE_REF_KEY is required when address/POI search is enabled in production.",
    );
  }
  if (rawKey) decodeGeocodePlaceRefKey(rawKey);
}

function assertSealableGeocodePlace(
  place: Place,
): asserts place is Place & {
  kind: "address" | "poi";
  lat: number;
  lon: number;
} {
  if (place.kind !== "address" && place.kind !== "poi") {
    throw new Error("Only address or POI geocoder results can become PlaceRefs.");
  }
  if (
    !isCoordinate(place.lat, -90, 90) ||
    !isCoordinate(place.lon, -180, 180)
  ) {
    throw new Error("Geocoder result must contain valid coordinates.");
  }
  if (!isBoundedString(place.label, 1, 500)) {
    throw new Error("Geocoder result must contain a bounded label.");
  }
  if (
    !isOptionalBoundedString(place.borough, 100) ||
    !isOptionalBoundedString(place.formattedAddress, 1000) ||
    !isOptionalBoundedString(place.attribution, 500)
  ) {
    throw new Error("Geocoder result must contain bounded geocoder metadata.");
  }
}

function isValidPayload(
  value: unknown,
  now: number,
): value is GeocodePlaceRefPayload {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return (
    p.v === 1 &&
    Number.isSafeInteger(p.e) &&
    (p.e as number) > now &&
    isBoundedString(p.l, 1, 500) &&
    (p.k === "address" || p.k === "poi") &&
    isCoordinate(p.a, -90, 90) &&
    isCoordinate(p.o, -180, 180) &&
    isOptionalBoundedString(p.b, 100) &&
    isOptionalBoundedString(p.f, 1000) &&
    isOptionalBoundedString(p.t, 500)
  );
}

function isCoordinate(
  value: unknown,
  min: number,
  max: number,
): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function isBoundedString(
  value: unknown,
  minLength: number,
  maxLength: number,
): value is string {
  return (
    typeof value === "string" &&
    value.length >= minLength &&
    value.length <= maxLength
  );
}

function isOptionalBoundedString(
  value: unknown,
  maxLength: number,
): value is string | undefined {
  return value === undefined || isBoundedString(value, 1, maxLength);
}
