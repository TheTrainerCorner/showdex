import { LegalLockedFormats } from '@showdex/consts';
import { formatId } from '@showdex/utils/app';
import type { AbilityName } from '@smogon/calc/dist/data/interface';
import type { CalcdexPokemon } from '@showdex/redux/store';
import { detectGenFromFormat } from './detectGenFromFormat';
import { detectLegacyGen } from './detectLegacyGen';

export interface PokemonAbilityOption {
  label: string;
  options: {
    label: string;
    value: AbilityName;
  }[];
}

/**
 * Builds the value for the `options` prop of the abilities `Dropdown` component in `PokeInfo`.
 *
 * @since 1.0.1
 */
export const buildAbilityOptions = (
  // dex: Generation,
  format: string,
  pokemon: DeepPartial<CalcdexPokemon>,
): PokemonAbilityOption[] => {
  const options: PokemonAbilityOption[] = [];

  // for legacy formats, the dex will return a 'No Ability' ability,
  // so make sure we return an empty array
  const gen = detectGenFromFormat(format);
  const legacy = detectLegacyGen(gen);

  if (legacy || !pokemon?.speciesForme) {
    return options;
  }

  // const ability = pokemon.dirtyAbility ?? pokemon.ability;

  const {
    serverSourced,
    baseAbility,
    ability,
    abilities,
    altAbilities,
    transformedAbilities,
    transformedForme,
  } = pokemon;

  // keep track of what moves we have so far to avoid duplicate options
  const filterAbilities: AbilityName[] = [];

  if (ability !== baseAbility) {
    options.push({
      label: formatId(baseAbility) === 'trace' ? 'Traced' : 'Inherited',
      options: [{
        label: ability,
        value: ability,
      }],
    });

    filterAbilities.push(ability);
  }

  if (transformedForme) {
    const transformed = Array.from(new Set([
      serverSourced && ability,
      ...transformedAbilities,
    ])).filter((n) => !!n && !abilities.includes(n)).sort();

    options.push({
      label: 'Transformed',
      options: transformed.map((name) => ({
        label: name,
        value: name,
      })),
    });

    filterAbilities.push(...transformed);
  }

  if (altAbilities?.length) {
    const poolAbilities = altAbilities
      .filter((n) => !!n && !filterAbilities.includes(n))
      .sort();

    options.push({
      label: 'Pool',
      options: poolAbilities.map((name) => ({
        label: name,
        value: name,
      })),
    });

    filterAbilities.push(...poolAbilities);
  }

  if (abilities?.length) {
    const legalAbilities = abilities
      .filter((n) => !!n && !filterAbilities.includes(n))
      .sort();

    options.push({
      label: 'Legal',
      options: legalAbilities.map((name) => ({
        label: name,
        value: name,
      })),
    });

    filterAbilities.push(...legalAbilities);
  }

  // show all possible abilities if format is not provided, is not legal-locked, or
  // no legal abilities are available (probably because the Pokemon doesn't exist in the `dex`'s gen)
  const parsedFormat = format?.replace(/^gen\d+/i, '');

  if (!parsedFormat || !LegalLockedFormats.includes(parsedFormat) || !abilities?.length) {
    const otherAbilities = Object.values(BattleAbilities || {})
      .map((a) => <AbilityName> a?.name)
      .filter((n) => !!n && formatId(n) !== 'noability' && !filterAbilities.includes(n))
      .sort();

    options.push({
      label: 'All',
      options: otherAbilities.map((name) => ({
        label: name,
        value: name,
      })),
    });
  }

  return options;
};
