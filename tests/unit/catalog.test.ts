import { describe, expect, it } from "vitest";
import { coordinateLocations } from "@/modules/locations";
import { sectionDefinitions } from "@/modules/sections/schema";
import { schemas } from "@/modules/cms";
describe("catalog theme and locations", () => {
  it("accepts real coordinates including zero and excludes missing/out-of-range points", () => {
    expect(
      coordinateLocations([
        { latitude: 0, longitude: 0 },
        { latitude: null, longitude: null },
        { latitude: 91, longitude: 20 },
        { latitude: 42.7, longitude: 23.3 },
      ]),
    ).toEqual([
      { latitude: 0, longitude: 0 },
      { latitude: 42.7, longitude: 23.3 },
    ]);
  });
  it("registers locations using the existing scoped location reference", () => {
    expect(
      sectionDefinitions.LOCATIONS.schema.parse({
        locationId: "existing-location",
      }),
    ).toEqual({ locationId: "existing-location" });
    expect(schemas.branding.shape.headingFont.parse("montserrat")).toBe(
      "montserrat",
    );
    expect(schemas.navigation.shape.key.parse("footer-info")).toBe(
      "footer-info",
    );
  });
});
