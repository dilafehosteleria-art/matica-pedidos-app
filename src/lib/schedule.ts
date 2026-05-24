import { ORDER_WINDOW_MESSAGE } from "./constants";

const ORDER_START_MINUTES = 9 * 60 + 30;
const ORDER_END_MINUTES = 12 * 60 + 30;

function getMadridParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Madrid",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";

  return {
    weekday: get("weekday"),
    hour: Number(get("hour")),
    minute: Number(get("minute"))
  };
}

export function isOrderWindowOpen(date = new Date()) {
  const { weekday, hour, minute } = getMadridParts(date);
  const isWeekday = ["Mon", "Tue", "Wed", "Thu"].includes(weekday);
  const minutes = hour * 60 + minute;

  return isWeekday && minutes >= ORDER_START_MINUTES && minutes <= ORDER_END_MINUTES;
}

export function getOrderWindowState(date = new Date()) {
  const open = isOrderWindowOpen(date);

  return {
    open,
    message: open ? "Pedidos abiertos hasta las 12:30." : ORDER_WINDOW_MESSAGE
  };
}
