export function timeToMinutes(value: string) {
  const [hour, minute] = value.slice(0, 5).split(":").map(Number);

  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return -1;
  }

  return hour * 60 + minute;
}

export function buildLocalRequestedTimeOptions(currentTime: string, closeTime: string) {
  const currentMinutes = timeToMinutes(currentTime);
  const closeMinutes = timeToMinutes(closeTime);

  if (currentMinutes < 0 || closeMinutes < 0 || currentMinutes >= closeMinutes) {
    return [] as string[];
  }

  const firstSlot = Math.ceil((currentMinutes + 1) / 15) * 15;
  const options: string[] = [];

  for (let minutes = firstSlot; minutes < closeMinutes; minutes += 15) {
    const hour = String(Math.floor(minutes / 60)).padStart(2, "0");
    const minute = String(minutes % 60).padStart(2, "0");
    options.push(`${hour}:${minute}`);
  }

  return options;
}
