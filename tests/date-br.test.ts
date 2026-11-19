import { describe, expect, it } from "vitest";
import { brToISO, brToMonth, isoToBR, maskDateBR, maskMonthBR, monthToBR } from "@/lib/dates";

describe("datas no formato brasileiro", () => {
  it("converte ida e volta", () => {
    expect(isoToBR("2026-12-20")).toBe("20/12/2026");
    expect(brToISO("20/12/2026")).toBe("2026-12-20");
    expect(monthToBR("2027-03")).toBe("03/2027");
    expect(brToMonth("03/2027")).toBe("2027-03");
  });
  it("rejeita datas inexistentes ou incompletas", () => {
    expect(brToISO("31/02/2027")).toBeNull();
    expect(brToISO("29/02/2028")).toBe("2028-02-29"); // bissexto
    expect(brToISO("12/2026")).toBeNull();
    expect(brToISO("00/12/2026")).toBeNull();
    expect(brToMonth("13/2026")).toBeNull();
    expect(isoToBR("")).toBe("");
  });
  it("máscara de digitação progressiva", () => {
    expect(maskDateBR("2")).toBe("2");
    expect(maskDateBR("201")).toBe("20/1");
    expect(maskDateBR("20122026")).toBe("20/12/2026");
    expect(maskDateBR("20/12/20269")).toBe("20/12/2026");
    expect(maskMonthBR("122026")).toBe("12/2026");
  });
});
