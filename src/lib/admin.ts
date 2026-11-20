import { NextRequest, NextResponse } from "next/server";
import { isAdminPinValid } from "@/lib/admin-pin";

export function assertAdmin(request: NextRequest) {
  const configuredPin = process.env.ADMIN_PIN;

  if (!configuredPin) {
    return NextResponse.json(
      { error: "ADMIN_PIN no está configurado en el entorno." },
      { status: 500 }
    );
  }

  if (!isAdminPinValid(request.headers.get("x-admin-pin") ?? "", configuredPin)) {
    return NextResponse.json({ error: "PIN de administrador no válido." }, { status: 401 });
  }

  return null;
}
