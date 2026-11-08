/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as ai_models from "../ai/models.js";
import type * as ai_translationAi from "../ai/translationAi.js";
import type * as ai_voice from "../ai/voice.js";
import type * as auth from "../auth.js";
import type * as http from "../http.js";
import type * as items from "../items.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_languages from "../lib/languages.js";
import type * as lib_srs from "../lib/srs.js";
import type * as lib_text from "../lib/text.js";
import type * as lib_voices from "../lib/voices.js";
import type * as practice from "../practice.js";
import type * as profiles from "../profiles.js";
import type * as recordings from "../recordings.js";
import type * as seeds_frEs from "../seeds/frEs.js";
import type * as seeds_types from "../seeds/types.js";
import type * as settings from "../settings.js";
import type * as translation from "../translation.js";
import type * as units from "../units.js";
import type * as voiceLab from "../voiceLab.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  "ai/models": typeof ai_models;
  "ai/translationAi": typeof ai_translationAi;
  "ai/voice": typeof ai_voice;
  auth: typeof auth;
  http: typeof http;
  items: typeof items;
  "lib/auth": typeof lib_auth;
  "lib/languages": typeof lib_languages;
  "lib/srs": typeof lib_srs;
  "lib/text": typeof lib_text;
  "lib/voices": typeof lib_voices;
  practice: typeof practice;
  profiles: typeof profiles;
  recordings: typeof recordings;
  "seeds/frEs": typeof seeds_frEs;
  "seeds/types": typeof seeds_types;
  settings: typeof settings;
  translation: typeof translation;
  units: typeof units;
  voiceLab: typeof voiceLab;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
