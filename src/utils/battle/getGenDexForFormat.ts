import { env } from '@showdex/utils/core';
import type { GenerationNum } from '@smogon/calc';
import type { Generation } from '@smogon/calc/dist/data/interface';
import { detectGenFromFormat } from './detectGenFromFormat';
import { getDexForFormat } from './getDexForFormat';
import { getNaturesDex } from './getNaturesDex';
import { getTypesDex } from './getTypesDex';

/**
 * Returns a somewhat compatible `Generation` dex (same one from `@pkmn/data`) based on the
 * global `Dex` object obtained via `getDexForFormat()`.
 *
 * * Provides missing properties in the global `Dex` object, such as `natures` and `types`.
 * * Note that the returned classes in the `get()` functions of the global `Dex` object
 *   (e.g., `dex.species.get()`) are not 100% compatible with those from `@pkmn/data`.
 *   - However, they provide enough info for `@smogon/calc` to populate the relevant properties
 *     required for calculating the matchup.
 *
 * @since 1.0.3
 */
export const getGenDexForFormat = (format: string | GenerationNum): Generation => {
  const dex = getDexForFormat(format);

  if (!dex) {
    return null;
  }

  const gen = <GenerationNum> dex.gen
    || (
      typeof format === 'string'
        ? detectGenFromFormat(format)
        : env.int<GenerationNum>('calcdex-default-gen')
    );

  return <Generation> <unknown> {
    ...dex,
    num: gen,
    natures: getNaturesDex(),
    types: getTypesDex(gen),
  };
};