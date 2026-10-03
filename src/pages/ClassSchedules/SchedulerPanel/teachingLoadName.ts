import type { Faculty } from "./types";

/** "CBA" / "secretary demo" -> "Cba" / "Secretary Demo": first letter of each word only. */
const capitalizeWords = (text: string) =>
  text.toLowerCase().replace(/(^|\s)(\S)/g, (_, gap: string, letter: string) => gap + letter.toUpperCase());

const parseFacultyName = (name: string) => {
  const parts = name.trim().split(/\s+/);
  let surname = "";
  let givenName = "";
  let mi = "";

  if (parts.length > 0) {
    surname = parts[parts.length - 1];
    if (parts.length > 1) {
      const secondToLast = parts[parts.length - 2];
      const hasPeriod = secondToLast.endsWith(".");
      const isShort = secondToLast.length <= 2;
      if (hasPeriod || isShort) {
        mi = secondToLast;
        givenName = parts.slice(0, parts.length - 2).join(" ");
      } else {
        givenName = parts.slice(0, parts.length - 1).join(" ");
      }
    }
  }
  return { surname, givenName, mi };
};

/**
 * The sheet's name fields, read from the stored parts rather than re-split from
 * `name`, which carries first and last name only: splitting it lost every
 * middle initial and suffix. `middle_name` holds a full name or just an
 * initial, so only its first letter is used. The suffix rides with the given
 * name, as on the Personal Data Sheet's name extension, and is printed as
 * stored -- "III" must not become "Iii".
 */
export const facultyNameParts = (faculty: Faculty) => {
  if (!faculty.firstName || !faculty.lastName) {
    const parsed = parseFacultyName(faculty.name);
    return {
      surname: capitalizeWords(parsed.surname),
      givenName: capitalizeWords(parsed.givenName),
      middleInitial: parsed.mi,
      fullName: capitalizeWords(faculty.name),
    };
  }

  const initial = (faculty.middleName ?? "").trim().charAt(0).toUpperCase();
  const middleInitial = initial ? `${initial}.` : "";
  const suffix = (faculty.suffix ?? "").trim();
  const firstName = capitalizeWords(faculty.firstName.trim());
  const lastName = capitalizeWords(faculty.lastName.trim());

  return {
    surname: lastName,
    givenName: [firstName, suffix].filter(Boolean).join(" "),
    middleInitial,
    fullName: [firstName, middleInitial, lastName, suffix].filter(Boolean).join(" "),
  };
};
