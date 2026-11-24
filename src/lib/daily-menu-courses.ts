import { BUREAU_VERITAS_COMPANY } from "./constants.ts";
import { isCustomSaladChoice, normalizeMenuSaladChoice } from "./salad-config.ts";
import type { DailyMenu, ProductType } from "./types.ts";

type MenuCourses = Pick<DailyMenu, "first_courses" | "second_courses">;
type MenuProductType = "daily_menu" | "half_menu";
export type MenuCourseField = "first_course" | "second_course" | "plate";

export function isDailyMenuProduct(type: ProductType): type is MenuProductType {
  return type === "daily_menu" || type === "half_menu";
}

export function getDailyMenuCourses(menu: MenuCourses | null) {
  return {
    first: (menu?.first_courses ?? []).map(normalizeMenuSaladChoice).filter(Boolean),
    second: (menu?.second_courses ?? [])
      .map((course) => (typeof course === "string" ? course : course?.name ?? "").trim())
      .filter(Boolean)
  };
}

export function isHalfMenuPlateAllowedForCompany(plate: string, companySlug: string | undefined) {
  return companySlug === BUREAU_VERITAS_COMPANY.slug || !isCustomSaladChoice(plate);
}

export function getHalfMenuPlates(menu: MenuCourses | null, companySlug: string | undefined) {
  const { first, second } = getDailyMenuCourses(menu);
  return [...first, ...second].filter((plate) => isHalfMenuPlateAllowedForCompany(plate, companySlug));
}

export function getUnavailableMenuFields(
  type: MenuProductType,
  metadata: Record<string, string>,
  menu: MenuCourses | null,
  companySlug: string
): MenuCourseField[] {
  const choice = (field: MenuCourseField) =>
    typeof metadata[field] === "string" ? metadata[field].trim() : "";

  if (type === "half_menu") {
    const plate = choice("plate");
    const plates = getHalfMenuPlates(menu, companySlug);
    return plates.includes(plate) || plates.includes(normalizeMenuSaladChoice(plate)) ? [] : ["plate"];
  }

  const { first, second } = getDailyMenuCourses(menu);
  const invalidFields: MenuCourseField[] = [];
  if (!first.includes(normalizeMenuSaladChoice(choice("first_course")))) invalidFields.push("first_course");
  if (!second.includes(choice("second_course"))) invalidFields.push("second_course");
  return invalidFields;
}
