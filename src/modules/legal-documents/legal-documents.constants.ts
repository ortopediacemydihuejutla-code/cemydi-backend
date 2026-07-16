export const LEGAL_DOCUMENT_SLUGS = [
  'politicas-de-privacidad',
  'terminos-y-condiciones',
] as const;

export type LegalDocumentSlug = (typeof LEGAL_DOCUMENT_SLUGS)[number];

export type LegalDocumentSection = {
  id: string;
  title: string;
  body: string;
  variant?: 'medical-alert';
};

export type LegalDocumentFields = Record<string, string | boolean>;

export type LegalDocumentContent = {
  fields: LegalDocumentFields;
  customSections: LegalDocumentSection[];
};

export type LegalDocumentDefaults = LegalDocumentContent & {
  slug: LegalDocumentSlug;
  title: string;
  description: string;
};

const PRIVACY_SECTION_ORDER = [
  'responsable',
  'datos-recopilados',
  'datos-medicos',
  'uso-informacion',
  'consentimiento',
  'transferencias',
  'cookies',
  'derechos-arco',
  'conservacion-seguridad',
  'cambios-privacidad',
];

const TERMS_SECTION_ORDER = [
  'aceptacion-alcance',
  'cuentas-elegibilidad',
  'productos-precios',
  'descargo-medico',
  'ventas-envios',
  'ventas-garantias',
  'devoluciones-cancelaciones',
  'rentas-requisitos',
  'rentas-depositos',
  'rentas-higiene',
  'rentas-penalizaciones',
  'instalacion-domicilio',
  'pagos-facturacion',
  'responsabilidad-uso',
  'propiedad-intelectual',
  'cambios-reclamaciones',
];

const DEMO_PARAGRAPH =
  '<p style="text-align: justify"><strong>Texto de demostración.</strong> Este contenido permite revisar la tipografía, el espaciado y la lectura del documento. El cliente podrá reemplazarlo completamente desde el panel administrativo.</p>';
const DEMO_LIST =
  '<p style="text-align: justify">Ejemplo de información presentada mediante viñetas:</p><ul><li>Primer elemento de ejemplo.</li><li>Segundo elemento de ejemplo.</li><li>Tercer elemento de ejemplo.</li></ul>';

export const DEFAULT_LEGAL_DOCUMENTS: Record<
  LegalDocumentSlug,
  LegalDocumentDefaults
> = {
  'politicas-de-privacidad': {
    slug: 'politicas-de-privacidad',
    title: 'Política de privacidad',
    description:
      'Contenido demostrativo para revisar la estructura visual del aviso de privacidad.',
    fields: {
      effectiveDate: '2026-07-15',
      companyName: 'Empresa de ejemplo S.A. de C.V.',
      taxId: 'XAXX010101000',
      address: 'Domicilio de ejemplo, Huejutla de Reyes, Hidalgo.',
      privacyEmail: 'privacidad@ejemplo.com',
      personalDataCollected: DEMO_LIST,
      medicalData: DEMO_PARAGRAPH,
      informationUse: DEMO_PARAGRAPH,
      consentAndLegalBasis: DEMO_PARAGRAPH,
      thirdPartyTransfer: DEMO_PARAGRAPH,
      cookiesEnabled: true,
      cookiesContent: DEMO_PARAGRAPH,
      arcoRights: DEMO_LIST,
      retentionAndSecurity: DEMO_PARAGRAPH,
      privacyChanges: DEMO_PARAGRAPH,
      sectionOrder: JSON.stringify(PRIVACY_SECTION_ORDER),
    },
    customSections: [],
  },
  'terminos-y-condiciones': {
    slug: 'terminos-y-condiciones',
    title: 'Términos y condiciones',
    description:
      'Contenido demostrativo para revisar la estructura visual de los términos y condiciones.',
    fields: {
      effectiveDate: '2026-07-15',
      acceptanceAndScope:
        '<h2>Alcance de ejemplo</h2><p style="text-align: justify">Este es un texto de demostración para visualizar cómo se presentará una sección extensa. El administrador podrá modificar títulos, párrafos, listas, enlaces y su orden desde el panel.</p>',
      accountEligibility: DEMO_PARAGRAPH,
      productsPricingAvailability: DEMO_LIST,
      medicalDisclaimer:
        '<p style="text-align: justify"><strong>Aviso de demostración:</strong> esta alerta muestra cómo resaltará la información médica importante dentro del documento.</p>',
      salesShipping: DEMO_PARAGRAPH,
      salesWarranties: DEMO_PARAGRAPH,
      returnsAndCancellations: DEMO_LIST,
      rentalRequirements: DEMO_LIST,
      rentalDeposits: DEMO_PARAGRAPH,
      rentalHygiene: DEMO_PARAGRAPH,
      rentalPenalties: DEMO_PARAGRAPH,
      homeInstallation: DEMO_PARAGRAPH,
      paymentAndBilling: DEMO_LIST,
      liabilityAndSafeUse: DEMO_PARAGRAPH,
      intellectualProperty: DEMO_PARAGRAPH,
      changesAndClaims: DEMO_PARAGRAPH,
      sectionOrder: JSON.stringify(TERMS_SECTION_ORDER),
    },
    customSections: [],
  },
};

export const LEGAL_FIELD_KEYS: Record<LegalDocumentSlug, string[]> = {
  'politicas-de-privacidad': [
    'effectiveDate',
    'companyName',
    'taxId',
    'address',
    'privacyEmail',
    'personalDataCollected',
    'medicalData',
    'informationUse',
    'consentAndLegalBasis',
    'thirdPartyTransfer',
    'cookiesEnabled',
    'cookiesContent',
    'arcoRights',
    'retentionAndSecurity',
    'privacyChanges',
    'sectionOrder',
  ],
  'terminos-y-condiciones': [
    'effectiveDate',
    'acceptanceAndScope',
    'accountEligibility',
    'productsPricingAvailability',
    'medicalDisclaimer',
    'salesShipping',
    'salesWarranties',
    'returnsAndCancellations',
    'rentalRequirements',
    'rentalDeposits',
    'rentalHygiene',
    'rentalPenalties',
    'homeInstallation',
    'paymentAndBilling',
    'liabilityAndSafeUse',
    'intellectualProperty',
    'changesAndClaims',
    'sectionOrder',
  ],
};

export function isLegalDocumentSlug(value: string): value is LegalDocumentSlug {
  return LEGAL_DOCUMENT_SLUGS.includes(value as LegalDocumentSlug);
}

export function buildLegalSections(
  slug: LegalDocumentSlug,
  fields: LegalDocumentFields,
  customSections: LegalDocumentContent['customSections'],
): LegalDocumentSection[] {
  const responsibleBody = [
    ['Razón social / empresa', fields.companyName],
    ['RFC / identificación', fields.taxId],
    ['Domicilio', fields.address],
    ['Correo de privacidad', fields.privacyEmail],
  ]
    .filter(([, value]) => String(value ?? '').trim())
    .map(([label, value]) => `**${label}:** ${String(value)}`)
    .join('\n\n');

  const fixed =
    slug === 'politicas-de-privacidad'
      ? [
          {
            id: 'responsable',
            title: 'Responsable del tratamiento',
            body: responsibleBody,
          },
          {
            id: 'datos-recopilados',
            title: 'Datos personales que recopilamos',
            body: String(fields.personalDataCollected ?? ''),
          },
          {
            id: 'datos-medicos',
            title: 'Datos sensibles y médicos',
            body: String(fields.medicalData ?? ''),
          },
          {
            id: 'uso-informacion',
            title: 'Uso de la información',
            body: String(fields.informationUse ?? ''),
          },
          {
            id: 'consentimiento',
            title: 'Consentimiento y fundamento del tratamiento',
            body: String(fields.consentAndLegalBasis ?? ''),
          },
          {
            id: 'transferencias',
            title: 'Transferencia a terceros',
            body: String(fields.thirdPartyTransfer ?? ''),
          },
          {
            id: 'cookies',
            title: 'Uso de cookies',
            body: String(fields.cookiesContent ?? '').trim()
              ? `${fields.cookiesEnabled ? '**Cookies habilitadas.**' : '**Cookies no habilitadas.**'}\n\n${String(fields.cookiesContent)}`
              : '',
          },
          {
            id: 'derechos-arco',
            title: 'Derechos ARCO',
            body: String(fields.arcoRights ?? ''),
          },
          {
            id: 'conservacion-seguridad',
            title: 'Conservación y seguridad',
            body: String(fields.retentionAndSecurity ?? ''),
          },
          {
            id: 'cambios-privacidad',
            title: 'Cambios al aviso y contacto',
            body: String(fields.privacyChanges ?? ''),
          },
        ]
      : [
          {
            id: 'aceptacion-alcance',
            title: 'Aceptación y alcance',
            body: String(fields.acceptanceAndScope ?? ''),
          },
          {
            id: 'cuentas-elegibilidad',
            title: 'Cuentas y capacidad para contratar',
            body: String(fields.accountEligibility ?? ''),
          },
          {
            id: 'productos-precios',
            title: 'Productos, precios y disponibilidad',
            body: String(fields.productsPricingAvailability ?? ''),
          },
          {
            id: 'descargo-medico',
            title: 'Descargo médico',
            body: String(fields.medicalDisclaimer ?? ''),
            variant: 'medical-alert' as const,
          },
          {
            id: 'ventas-envios',
            title: 'Ventas — Envíos y tiempos',
            body: String(fields.salesShipping ?? ''),
          },
          {
            id: 'ventas-garantias',
            title: 'Ventas — Garantías',
            body: String(fields.salesWarranties ?? ''),
          },
          {
            id: 'devoluciones-cancelaciones',
            title: 'Cancelaciones, cambios y devoluciones',
            body: String(fields.returnsAndCancellations ?? ''),
          },
          {
            id: 'rentas-requisitos',
            title: 'Rentas — Requisitos y documentos',
            body: String(fields.rentalRequirements ?? ''),
          },
          {
            id: 'rentas-depositos',
            title: 'Rentas — Depósitos (fianza)',
            body: String(fields.rentalDeposits ?? ''),
          },
          {
            id: 'rentas-higiene',
            title: 'Rentas — Higiene y estado',
            body: String(fields.rentalHygiene ?? ''),
          },
          {
            id: 'rentas-penalizaciones',
            title: 'Rentas — Penalizaciones',
            body: String(fields.rentalPenalties ?? ''),
          },
          {
            id: 'instalacion-domicilio',
            title: 'Instalación a domicilio',
            body: String(fields.homeInstallation ?? ''),
          },
          {
            id: 'pagos-facturacion',
            title: 'Métodos de pago y facturación',
            body: String(fields.paymentAndBilling ?? ''),
          },
          {
            id: 'responsabilidad-uso',
            title: 'Uso seguro y responsabilidad',
            body: String(fields.liabilityAndSafeUse ?? ''),
          },
          {
            id: 'propiedad-intelectual',
            title: 'Propiedad intelectual',
            body: String(fields.intellectualProperty ?? ''),
          },
          {
            id: 'cambios-reclamaciones',
            title: 'Cambios, contacto y reclamaciones',
            body: String(fields.changesAndClaims ?? ''),
          },
        ];

  const visibleSections = [...fixed, ...customSections].filter(
    (section) => section.title.trim() && section.body.trim(),
  );

  let requestedOrder: string[] = [];
  try {
    const parsed = JSON.parse(String(fields.sectionOrder ?? '[]')) as unknown;
    if (Array.isArray(parsed)) {
      requestedOrder = parsed.filter(
        (value): value is string => typeof value === 'string',
      );
    }
  } catch {
    requestedOrder = [];
  }

  const positions = new Map(
    requestedOrder.map((sectionId, index) => [sectionId, index]),
  );

  return visibleSections.sort((a, b) => {
    const aPosition = positions.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const bPosition = positions.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    return aPosition - bPosition;
  });
}
