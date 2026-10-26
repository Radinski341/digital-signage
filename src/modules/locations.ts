export function coordinateLocations<
  T extends { latitude?: number | null; longitude?: number | null },
>(locations: T[]) {
  return locations.filter(
    (location): location is T & { latitude: number; longitude: number } =>
      typeof location.latitude === "number" &&
      Number.isFinite(location.latitude) &&
      location.latitude >= -90 &&
      location.latitude <= 90 &&
      typeof location.longitude === "number" &&
      Number.isFinite(location.longitude) &&
      location.longitude >= -180 &&
      location.longitude <= 180,
  );
}
