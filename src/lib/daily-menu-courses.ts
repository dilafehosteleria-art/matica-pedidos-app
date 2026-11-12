import { normalizeMenuSaladChoice } from "./salad-config.ts";
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

export function getUnavailableMenuFields(
  type: MenuProductType,
  metadata: Record<string, string>,
  menu: MenuCourses | null
): MenuCourseField[] {
  const { first, second } = getDailyMenuCourses(menu);
  const choice = (field: MenuCourseField) =>
    typeof metadata[field] === "string" ? metadata[field].trim() : "";

  if (type === "half_menu") {
    const plate = choice("plate");
    return first.includes(normalizeMenuSaladChoice(plate)) || second.includes(plate) ? [] : ["plate"];
  }

  const invalidFields: MenuCourseField[] = [];
  if (!first.includes(normalizeMenuSaladChoice(choice("first_course")))) invalidFields.push("first_course");
  if (!second.includes(choice("second_course"))) invalidFields.push("second_course");
  return invalidFields;
}
