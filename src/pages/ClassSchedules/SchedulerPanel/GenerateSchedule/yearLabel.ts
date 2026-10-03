import type { Section } from "../types";

/** "BSBA 2nd year": prefixed with the programs of the given sections. */
export const yearLabel = (yearLevel: number, sections: Section[]) => {
  const ordinal =
    yearLevel === 1
      ? "1st"
      : yearLevel === 2
        ? "2nd"
        : yearLevel === 3
          ? "3rd"
          : "4th";
  const programs = [
    ...new Set(sections.map((section) => section.programCode).filter(Boolean)),
  ].join(" / ");
  return programs ? `${programs} ${ordinal} year` : `${ordinal[0].toUpperCase()}${ordinal.slice(1)} year`;
};
