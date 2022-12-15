import { PokemonNatures, PokemonTypes } from '@showdex/consts/pokemon';
import { formatId } from '@showdex/utils/app';
import { calcPresetCalcdexId } from '@showdex/utils/calc';
import { clamp, env } from '@showdex/utils/core';
import { capitalize } from '@showdex/utils/humanize';
import type { GenerationNum } from '@smogon/calc';
import type { AbilityName, ItemName, MoveName } from '@smogon/calc/dist/data/interface';
import type { CalcdexPokemonPreset } from '@showdex/redux/store';
import { detectGenFromFormat } from './detectGenFromFormat';
import { getDexForFormat } from './getDexForFormat';

// note: speciesForme should be handled last since it will test() true against any line technically
const PokePasteLineParsers: Partial<Record<keyof CalcdexPokemonPreset, RegExp>> = {
  level: /^\s*Level:\s*(\d+)$/i,
  ability: /^\s*Ability:\s*(.+)$/i,
  shiny: /^\s*Shiny:\s*([A-Z]+)$/i,
  happiness: /^\s*Happiness:\s*(\d+)$/i,
  // dynamaxLevel: /^\s*Dynamax Level:\s*(\d+)$/i, // unsupported
  gigantamax: /^\s*Gigantamax:\s*([A-Z]+)$/i,
  teraTypes: /^\s*Tera\s*Type:\s*([A-Z]+)$/i,
  ivs: /^\s*IVs:\s*(\d.+)$/i,
  evs: /^\s*EVs:\s*(\d.+)$/i,
  nature: /^\s*([A-Z]+)\s+Nature$/i,
  moves: /^\s*-\s*([A-Z0-9\(\)\[\]\-\x20]+[A-Z0-9\(\)\[\]])(?:\s*[\/,]\s*([A-Z0-9\(\)\[\]\-\x20]+[A-Z0-9\(\)\[\]]))?(?:\s*[\/,]\s*([A-Z0-9\(\)\[\]\-\x20]+[A-Z0-9\(\)\[\]]))?$/i,
  name: /^=+\s*(?:\[([A-Z0-9]+)\]\s*)(.+[^\s])\s*={3}$/i,
  speciesForme: /(?:\s*\(([A-Z\xC0-\xFF0-9\-]{2,})\))?(?:\s*\(([MF])\))?(?:\s*@\s*([A-Z0-9\-\x20]+[A-Z0-9]))?$/i,
};

const PokePasteSpreadParsers: Partial<Record<Showdown.StatName, RegExp>> = {
  hp: /(\d+)\s*HP/i,
  atk: /(\d+)\s*Atk/i,
  def: /(\d+)\s*Def/i,
  spa: /(\d+)\s*SpA/i,
  spd: /(\d+)\s*SpD/i,
  spe: /(\d+)\s*Spe/i,
};

/**
 * Imports the passed-in `pokePaste` into a `CalcdexPokemonPreset`.
 *
 * * Does not validate the actual values besides performing a `dex` lookup for the `name`.
 *   - i.e., It's entirely possible that imported sets may have illegal abilities, IVs/EVs, etc.
 * * Supports up to 3 moves per move line.
 *   - e.g., `'- Volt Switch / Surf / Volt Tackle'` is an acceptable move line.
 *   - Extraneous moves will be added to `altMoves` once `moves` fills up to its maximum length (e.g., `4`).
 * * `null` will be returned on the following conditions:
 *   - No `pokePaste` was provided, or
 *   - `speciesForme` couldn't be determined.
 *
 * @example
 * ```ts
 * importPokePaste(`
 *   The King (Slowking-Galar) @ Assault Vest
 *   Ability: Regenerator
 *   Shiny: Yes
 *   IVs: 0 Atk
 *   EVs: 248 HP / 84 SpA / 176 SpD
 *   Calm Nature
 *   - Future Sight
 *   - Scald
 *   - Sludge Bomb
 *   - Flamethrower
 * `, 'gen8ou');
 *
 * CalcdexPokemonPreset {
 *   // note: this is some random uuid for the example's sake
 *   calcdexId: 'fb1961f0-75f7-11ed-b30e-2d3f6d915c0a',
 *   id: 'fb1961f0-75f7-11ed-b30e-2d3f6d915c0a', // same as calcdexId
 *   source: 'import',
 *   name: 'Import', // default name if 3rd `name` arg isn't provided
 *   gen: 8,
 *   format: 'gen8ou',
 *   nickname: 'The King',
 *   speciesForme: 'Slowking-Galar',
 *   level: 100,
 *   item: 'Assault Vest',
 *   shiny: true,
 *   ivs: {
 *     hp: 31,
 *     atk: 0,
 *     def: 31,
 *     spa: 31,
 *     spd: 31,
 *     spe: 31,
 *   },
 *   evs: {
 *     hp: 248,
 *     atk: 0,
 *     def: 0,
 *     spa: 84,
 *     spd: 176,
 *     spe: 0,
 *   },
 *   nature: 'Calm',
 *   moves: [
 *     'Future Sight',
 *     'Scald',
 *     'Sludge Bomb',
 *     'Flamethrower',
 *   ],
 *   altMoves: [],
 * }
 * ```
 * @since 1.0.7
 */
export const importPokePaste = (
  pokePaste: string,
  format?: string,
  name = 'Import',
): CalcdexPokemonPreset => {
  if (!pokePaste) {
    return null;
  }

  const dex = getDexForFormat(format);
  const gen = detectGenFromFormat(format, env.int<GenerationNum>('calcdex-default-gen'));

  // this will be our final return value
  const preset: CalcdexPokemonPreset = {
    calcdexId: null,
    id: null,
    source: 'import',
    name,
    gen,
    format,

    speciesForme: null,
    level: 100,
    shiny: false,

    ivs: {
      hp: 31,
      atk: 31,
      def: 31,
      spa: 31,
      spd: 31,
      spe: 31,
    },

    evs: {
      hp: 0,
      atk: 0,
      def: 0,
      spa: 0,
      spd: 0,
      spe: 0,
    },

    nature: 'Hardy',

    moves: [],
    altMoves: [],
  };

  // first, split the pokePaste by newlines for easier line-by-line processing
  // (trim()ing here since Teambuilder adds a bunch of spaces at the end of each line)
  const lines = pokePaste.split(/\r?\n/).filter(Boolean).map((l) => l.trim());

  // process each line by matching regex (performance 100 ... /s)
  lines.forEach((line) => {
    if (!line || typeof line !== 'string') {
      return;
    }

    const [
      key,
      regex,
    ] = <[keyof CalcdexPokemonPreset, RegExp]> Object.entries(PokePasteLineParsers)
      .find(([, r]) => r.test(line))
      || [];

    if (!key || typeof regex?.exec !== 'function') {
      return;
    }

    switch (key) {
      // also handles: nickname, gender, item
      case 'speciesForme': {
        const remainingLine = line.replace(regex, '').trim();

        // calling regex.exec() for each case here to keep TypeScript happy lol
        const [
          ,
          detectedForme,
          detectedGender,
          detectedItem,
        ] = regex.exec(line) || [];

        // make sure these entries exist in the dex before applying them to the preset!
        const guessedForme = detectedForme || remainingLine;

        if (!guessedForme) {
          break;
        }

        const dexSpecies = dex?.species.get(guessedForme);

        if (!dexSpecies?.exists) {
          break;
        }

        preset.speciesForme = dexSpecies.name;

        if (detectedForme && remainingLine && guessedForme === detectedForme) {
          preset.nickname = remainingLine;
        }

        if (detectedGender && dexSpecies.gender !== 'N') {
          preset.gender = <Showdown.GenderName> detectedGender;
        }

        if (detectedItem) {
          const dexItem = dex?.items.get(detectedItem);

          if (dexItem?.exists) {
            preset.item = <ItemName> dexItem.name;
          }
        }

        break;
      }

      case 'level': {
        const [
          ,
          value,
        ] = regex.exec(line) || [];

        if (!value) {
          break;
        }

        const parsedLevel = clamp(0, parseInt(value, 10) || 0, 100);

        // ignore level 0 (probably falsy anyways)
        if (!parsedLevel) {
          break;
        }

        preset.level = parsedLevel;

        break;
      }

      case 'ability': {
        const [
          ,
          detectedAbility,
        ] = regex.exec(line) || [];

        if (!detectedAbility) {
          break;
        }

        const dexAbility = dex?.abilities.get(detectedAbility);

        if (!dexAbility?.exists) {
          break;
        }

        preset.ability = <AbilityName> dexAbility.name;

        break;
      }

      case 'shiny': {
        const [
          ,
          value,
        ] = regex.exec(line) || [];

        if (!value) {
          break;
        }

        // 'y' for "Yes" & 't' for "True"
        preset.shiny = /^[yt]/i.test(String(value).trim());

        break;
      }

      case 'happiness': {
        const [
          ,
          value,
        ] = regex.exec(line) || [];

        if (!value) {
          break;
        }

        preset.happiness = clamp(0, parseInt(value, 10) || 0, 255);

        break;
      }

      case 'gigantamax': {
        const [
          ,
          value,
        ] = regex.exec(line) || [];

        if (!value) {
          break;
        }

        const gigantamax = formatId(value)?.startsWith('y');

        // don't bother populating this if false
        if (!gigantamax) {
          break;
        }

        // see if we should append '-Gmax' to the end of the speciesForme
        if (preset.speciesForme) {
          const dexGmaxSpecies = dex?.species.get(`${preset.speciesForme}-Gmax`);

          if (dexGmaxSpecies?.exists) {
            preset.speciesForme = dexGmaxSpecies.name;
          }
        }

        preset.gigantamax = gigantamax; // always true lol

        break;
      }

      case 'teraTypes': {
        const [
          ,
          value,
        ] = regex.exec(line) || [];

        if (!value) {
          break;
        }

        const detectedType = <Showdown.TypeName> capitalize(value);

        if (!PokemonTypes.includes(detectedType) || detectedType === '???') {
          break;
        }

        preset.teraTypes = [detectedType];

        break;
      }

      case 'ivs':
      case 'evs': {
        const [
          ,
          detectedSpread,
        ] = regex.exec(line) || [];

        if (!detectedSpread) {
          break;
        }

        // run the detectedSpread through each stat parser
        // (note: we're purposefully not enforcing a max value, just a min to make sure it's non-negative at the very least)
        Object.entries(PokePasteSpreadParsers).forEach(([
          stat,
          spreadRegex,
        ]: [
          Showdown.StatName,
          RegExp,
        ]) => {
          const [
            ,
            statValueStr,
          ] = spreadRegex.exec(detectedSpread) || [];

          if (!statValueStr) {
            return;
          }

          preset[key][stat] = Math.max(0, parseInt(statValueStr, 10) || 0);
        });

        break;
      }

      case 'nature': {
        const [
          ,
          detectedNature,
        ] = regex.exec(line) || [];

        if (!detectedNature) {
          break;
        }

        const parsedNature = <Showdown.PokemonNature> capitalize(detectedNature);

        if (!PokemonNatures.includes(parsedNature)) {
          break;
        }

        preset.nature = parsedNature;

        break;
      }

      case 'moves': {
        // supports the following move formats (up to 3 moves per line; example is from Pikachu's "Revenge Killer" set in Gen 8 PU):
        // '- Volt Switch' -> detectedMove1: 'Volt Switch'
        // '- Volt Switch / Surf' -> detectedMove1: 'Volt Switch'; detectedMove2: 'Surf'
        // '- Volt Switch, Surf' (note the comma [,] instead of the foward slash [/]) -> detectedMove1: 'Volt Switch'; detectedMove2: 'Surf'
        // '- Volt Switch / Surf / Volt Tackle' -> detectedMove1: 'Volt Switch'; detectedMove2: 'Surf'; detectedMove3: 'Volt Tackle'
        const [
          ,
          detectedMove1,
          detectedMove2,
          detectedMove3,
        ] = regex.exec(line) || [];

        // no point in checking falsiness of detectedMove2 & detectedMove3 since detectedMove1 should always be non-falsy
        // (otherwise, the regex would fail!)
        if (!detectedMove1) {
          break;
        }

        const dexMoves = [
          detectedMove1,
          detectedMove2,
          detectedMove3,
        ].filter(Boolean)
          .map((n) => dex?.moves.get(formatId(n)))
          .filter((m) => m?.exists && !!m.name);

        if (!dexMoves.length) {
          break;
        }

        const dexMoveNames = dexMoves.map((m) => <MoveName> m.name);

        /**
         * @todo Update this once you add support for more than 4 moves.
         */
        const maxPresetMoves = 4;

        // only add the first move (detectedMove1) to the preset's moves,
        // then add any remaining moves (detectedMove2 & detectedMove3) to the preset's altMoves
        // (except if the move already is in the preset's moves, then ignore and try adding the remaining moves, if any)
        let addedToMoves = false;

        for (let i = 0; i < dexMoveNames.length; i++) {
          // no need to double-check if the dexMoveName exists here
          // since we processed and filtered the detected moves already
          const dexMoveName = dexMoveNames[i];

          // determine whether we're adding these move(s) to the preset's `moves` or `altMoves`
          const movesSource = addedToMoves || preset.moves.length + 1 > maxPresetMoves
            ? preset.altMoves
            : preset.moves;

          if (movesSource.includes(dexMoveName)) {
            continue;
          }

          movesSource.push(dexMoveName);

          if (!addedToMoves) {
            addedToMoves = true;
          }
        }

        break;
      }

      case 'name': {
        const [
          ,
          detectedFormat,
          detectedName,
        ] = regex.exec(line) || [];

        if (detectGenFromFormat(detectedFormat) > 0) {
          preset.format = detectedFormat.trim();
        }

        if (detectedName) {
          preset.name = detectedName?.trim() || name;
        }

        break;
      }

      default: {
        break;
      }
    }
  });

  if (!preset.speciesForme) {
    return null;
  }

  if (gen > 8 && !preset.teraTypes?.length) {
    const speciesTypes = dex.species.get(preset.speciesForme)?.types;

    if (speciesTypes?.length) {
      preset.teraTypes = [...speciesTypes];
    }
  }

  preset.calcdexId = calcPresetCalcdexId(preset);
  preset.id = preset.calcdexId;

  return preset;
};
