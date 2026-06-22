CREATE TABLE "management"."about_page" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "heroTitle" TEXT NOT NULL DEFAULT 'Quiénes somos',
  "heroSubtitle" TEXT NOT NULL DEFAULT 'Cuidamos tu movilidad con orientación cercana, productos confiables y acompañamiento humano en cada etapa.',
  "missionTitle" TEXT NOT NULL DEFAULT 'Misión',
  "missionText" TEXT NOT NULL DEFAULT 'Brindar soluciones ortopédicas, de rehabilitación y cuidado en casa con asesoría clara, productos de calidad y atención cercana para mejorar la movilidad y bienestar de cada persona.',
  "visionTitle" TEXT NOT NULL DEFAULT 'Visión',
  "visionText" TEXT NOT NULL DEFAULT 'Ser la ortopedia de referencia en la región por nuestra calidez, innovación y capacidad de acompañar a pacientes, familias e instituciones con soluciones oportunas.',
  "valuesTitle" TEXT NOT NULL DEFAULT 'Valores',
  "values" JSONB NOT NULL DEFAULT '["Empatía", "Confianza", "Responsabilidad", "Servicio", "Calidad"]',
  "storyTitle" TEXT NOT NULL DEFAULT 'Atención pensada para personas reales',
  "storyText" TEXT NOT NULL DEFAULT 'En CEMYDI reunimos experiencia, disponibilidad y orientación para que elegir un equipo ortopédico sea más sencillo. Escuchamos tu necesidad, resolvemos dudas y buscamos la alternativa adecuada para compra, renta o seguimiento.',
  "heroImageUrl" TEXT,
  "secondaryImageUrl" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "about_page_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "about_page_singleton" CHECK ("id" = 1)
);

INSERT INTO "management"."about_page" ("id")
VALUES (1)
ON CONFLICT ("id") DO NOTHING;
