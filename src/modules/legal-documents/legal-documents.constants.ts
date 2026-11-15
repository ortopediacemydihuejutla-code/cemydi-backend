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

export const DEFAULT_LEGAL_DOCUMENTS: Record<
  LegalDocumentSlug,
  LegalDocumentDefaults
> = {
  'politicas-de-privacidad': {
    slug: 'politicas-de-privacidad',
    title: 'Política de privacidad',
    description:
      'Aviso integral sobre el uso de datos personales en la aplicación y el sitio web de Ortopedia CEMYDI.',
    fields: {
      companyName: 'Ortopedia CEMYDI',
      address:
        'Av. Javier Rojo Gómez núm. 26, colonia 5 de Mayo, Huejutla de Reyes, Hidalgo, México.',
      privacyEmail: 'contacto@cemydi.com',
      personalDataCollected: `<p>Cuando te registras o actualizas tu perfil, tratamos tu nombre, correo electrónico, identificador de cuenta y, cuando los proporcionas, teléfono y domicilio. Si creas una contraseña, se almacena su hash para verificar tus accesos. Si eliges iniciar sesión con Google, usamos los datos de identidad que Google nos proporciona, como tu nombre y correo, y el token necesario para verificar el acceso.</p>
<p>Cuando usas el catálogo, tratamos tus consultas de búsqueda y los datos de tus favoritos, carrito y reseñas. Cuando solicitas una renta, tratamos los datos de contacto del solicitante, el nombre del paciente y su parentesco cuando la renta es para otra persona, la modalidad de entrega y, según corresponda, el domicilio, las referencias, los horarios, los equipos solicitados, las fechas, las notas, los importes y el estado del depósito.</p>
<p>Para operar y proteger el servicio podemos registrar la dirección IP, el navegador o dispositivo, los accesos y los errores técnicos. Si activas las notificaciones en tu dispositivo, tratamos el token de envío, el identificador de instalación y tus preferencias.</p>`,
      medicalData: `<p>Al solicitar la renta de un equipo que requiere receta, puedes adjuntar la imagen o el PDF que elijas. La receta y las notas que incluyan información clínica pueden contener datos sensibles sobre la salud del paciente, como indicaciones médicas o diagnósticos. Usamos la información de salud para verificar el requisito y gestionar la solicitud del equipo.</p>
<p>Adjunta únicamente lo necesario para la renta. Si compartes datos o recetas de otra persona, debes contar con su autorización o con la representación legal correspondiente. El personal autorizado revisa los archivos. Las recetas se mantienen fuera del catálogo y de las reseñas públicas.</p>`,
      informationUse: `<p>Usamos tus datos para crear y proteger tu cuenta, verificar tu correo, recuperar el acceso, operar el catálogo, guardar tus selecciones y tramitar, revisar y dar seguimiento a las rentas, entregas, devoluciones y depósitos. También los usamos para contestar consultas, moderar y publicar reseñas aprobadas, enviarte avisos de servicio y seguridad, atender solicitudes de privacidad y cumplir obligaciones legales.</p>
<p>Si activas las ofertas, usamos tus preferencias para enviarte promociones. Puedes rechazar esta finalidad desde el inicio, desactivar las ofertas en la configuración de notificaciones o solicitarlo por correo. Tu decisión permite seguir utilizando los servicios de cuenta y renta.</p>`,
      consentAndLegalBasis: `<p>Tratamos los datos según la finalidad, con tu consentimiento, para gestionar la relación de servicio o para cumplir una obligación legal, conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares.</p>
<p>Para tratar datos sensibles se requiere consentimiento expreso y por escrito mediante un mecanismo de autenticación, salvo las excepciones previstas por ley. Puedes revocar el consentimiento por correo conforme al procedimiento de derechos ARCO. La revocación se aplica hacia el futuro y puede impedir la tramitación de una solicitud si los datos son indispensables para atenderla.</p>`,
      thirdPartyTransfer: `<p>Para operar el servicio utilizamos proveedores de alojamiento e infraestructura, como Render, de almacenamiento de recetas y archivos, como Cloudinary, y de correo transaccional, como Brevo. Usamos Google para el inicio de sesión opcional y Expo y los servicios de notificaciones del dispositivo, como Firebase Cloud Messaging en Android, para enviar avisos cuando están habilitados. Para coordinar una entrega podemos comunicar los datos indispensables a quien la realiza.</p>
<p>Estos servicios pueden procesar datos desde México u otros países. Se limita la información a la necesaria para la tarea de cada proveedor. Podemos comunicar datos a autoridades cuando exista una obligación o requerimiento legal. Si una transferencia requiere consentimiento, lo solicitaremos conforme a la ley.</p>
<p>Si publicas una reseña, el nombre mostrado, la calificación y el comentario pueden hacerse visibles a otros visitantes tras la moderación. Evita incluir datos de contacto, información médica o datos de otras personas.</p>`,
      cookiesEnabled: true,
      cookiesContent: `<p>El sitio usa cookies para mantener la sesión y proteger las solicitudes, así como almacenamiento local para guardar preferencias y funciones del sitio. Puedes borrar o bloquear estos datos desde tu navegador. Algunas funciones, como el inicio de sesión, requieren las cookies necesarias.</p>
<p>La app usa almacenamiento del dispositivo y guarda las credenciales de sesión mediante el almacenamiento seguro del sistema. Puedes cambiar los permisos de micrófono y notificaciones en los ajustes del dispositivo.</p>
<p>Si inicias una búsqueda por voz y concedes permiso, el servicio de reconocimiento del dispositivo convierte tu voz en texto y puede procesar el audio fuera del dispositivo. CEMYDI utiliza el texto como consulta de catálogo y la app no conserva grabaciones. También puedes buscar escribiendo.</p>`,
      arcoRights: `<p>Puedes solicitar acceso a tus datos, rectificar los que sean incorrectos, pedir su cancelación u oponerte a determinados usos. También puedes revocar tu consentimiento o limitar el uso o divulgación de tus datos. Escríbenos a <a href="mailto:contacto@cemydi.com">contacto@cemydi.com</a> con el asunto «Datos personales».</p>
<p>Incluye tu nombre, un medio para responderte, los datos o el tratamiento al que se refiere tu solicitud y lo que deseas ejercer. Para rectificar datos, indica la corrección solicitada. Verificaremos tu identidad o, en su caso, tu representación y te indicaremos cómo aportar la documentación necesaria de forma segura. Responderemos dentro de los plazos legales.</p>
<p>Para eliminar tu cuenta, usa la opción en Perfil de la app o la página <a href="https://ortopedia-cemydi.netlify.app/eliminar-cuenta">Eliminar cuenta</a>, donde puedes confirmar la solicitud mediante un código enviado al correo verificado de tu cuenta. Si tienes rentas, devoluciones o depósitos pendientes, la eliminación continuará automáticamente al resolverlos. Mientras tanto podrás atender los pendientes y quedará suspendida la posibilidad de solicitar nuevas rentas.</p>`,
      retentionAndSecurity: `<p>Conservamos los datos durante el tiempo necesario para prestar el servicio, resolver operaciones pendientes, atender reclamaciones y cumplir los plazos legales aplicables. Usamos conexiones HTTPS, verificación de identidad y controles de acceso para proteger la información.</p>
<p>Al completarse la eliminación de la cuenta se eliminan el perfil, las credenciales, las sesiones, las reseñas, el carrito, los favoritos vinculados, las notificaciones y las recetas almacenadas. El historial operativo de rentas se conserva separado de la cuenta y sin los datos identificativos de la operación. Se conserva un registro mínimo de la solicitud de eliminación. Las copias de respaldo se depuran conforme a su ciclo de conservación y los datos que deban conservarse por ley quedan sujetos a acceso restringido.</p>`,
      privacyChanges: `<p>Publicamos la versión actualizada de este aviso en la <a href="https://ortopedia-cemydi.netlify.app/politicas-de-privacidad">Política de privacidad</a>. Cuando un cambio requiera tu consentimiento o una comunicación adicional, seguiremos el procedimiento aplicable. Para dudas sobre tus datos, escribe a <a href="mailto:contacto@cemydi.com">contacto@cemydi.com</a>.</p>`,
      sectionOrder: JSON.stringify(PRIVACY_SECTION_ORDER),
    },
    customSections: [],
  },
  'terminos-y-condiciones': {
    slug: 'terminos-y-condiciones',
    title: 'Términos y condiciones',
    description:
      'Condiciones de uso de la aplicación, el sitio web y los servicios de venta y renta de Ortopedia CEMYDI.',
    fields: {
      acceptanceAndScope: `<p>Estos términos aplican a la aplicación y al sitio de Ortopedia CEMYDI, al uso de la cuenta y el catálogo, y a las operaciones de venta y renta que CEMYDI confirme. Consulta nuestra <a href="https://ortopedia-cemydi.netlify.app/politicas-de-privacidad">Política de privacidad</a> para saber cómo tratamos tus datos personales.</p>
<p>Ortopedia CEMYDI atiende en Av. Javier Rojo Gómez núm. 26, colonia 5 de Mayo, Huejutla de Reyes, Hidalgo, México. Puedes contactar al equipo en <a href="mailto:contacto@cemydi.com">contacto@cemydi.com</a> o en el 789 688 0251.</p>`,
      accountEligibility: `<p>Puedes consultar el catálogo sin cuenta. Para contratar debes contar con capacidad legal y, si actúas por otra persona, con la autorización o representación necesaria. Para solicitar una renta necesitas una cuenta y los datos requeridos para tramitarla.</p>
<p>Proporciona información veraz, mantén tus datos actualizados y protege tu contraseña y tus códigos de verificación. Si detectas un acceso no autorizado, comunícalo a CEMYDI.</p>`,
      productsPricingAvailability: `<p>El catálogo muestra las características, la modalidad de adquisición, los precios en pesos mexicanos y la disponibilidad indicada al momento de la consulta. Los cupones y las promociones se aplican conforme a su vigencia, las condiciones informadas y la disponibilidad.</p>
<p>Agregar un producto al carrito permite preparar una selección. La venta o renta se confirma cuando CEMYDI verifica la disponibilidad y las partes aceptan las condiciones de la operación. Antes de contratar podrás conocer el importe total, los impuestos aplicables y los cargos de entrega, instalación o depósito que correspondan.</p>`,
      medicalDisclaimer: `<p>La información del catálogo, las reseñas y la orientación sobre equipos tienen fines informativos. Consulta a un profesional de la salud para obtener un diagnóstico, una indicación o ayuda para elegir un equipo adecuado. Usa el equipo de acuerdo con la prescripción aplicable y las instrucciones del fabricante. Si tienes una emergencia médica en México, llama al 911.</p>`,
      salesShipping: `<p>En una venta confirmada, las modalidades de entrega o recolección, su cobertura, el costo y la fecha o plazo se acuerdan antes de contratar. Proporciona un domicilio correcto y asegúrate de que alguien pueda recibir el pedido cuando corresponda. Si hay una incidencia, CEMYDI te comunicará las opciones disponibles conforme a la operación y a la ley.</p>`,
      salesWarranties: `<p>Las garantías se rigen por las condiciones informadas al contratar y por la legislación aplicable. Si recibes un producto defectuoso, diferente al acordado o con faltantes, comunícate con CEMYDI con tu comprobante o referencia para solicitar la atención que corresponda. Se respetan los derechos de reparación, reposición, devolución o bonificación previstos por la ley.</p>`,
      returnsAndCancellations: `<p>Para solicitar una cancelación, cambio o devolución de una compra, escribe a <a href="mailto:contacto@cemydi.com">contacto@cemydi.com</a> con tu referencia. Para una renta, usa la opción de cancelación cuando esté disponible en el detalle de la solicitud o contacta a CEMYDI. La atención, el reembolso y los plazos dependen del estado de la operación, lo acordado y los derechos previstos por la ley.</p>
<p>Se respeta el derecho de revocación aplicable a operaciones a distancia y los derechos por defectos, incumplimiento o falta de conformidad.</p>`,
      rentalRequirements: `<p>Indica los equipos, el periodo de renta, los datos del solicitante y, cuando corresponda, los datos del paciente y de entrega. Si el catálogo indica que un equipo requiere receta, adjunta una copia legible del documento solicitado.</p>
<p>El envío de la solicitud inicia su revisión. Puedes consultar el estado desde tu cuenta. Confirma con CEMYDI la disponibilidad, el periodo y las condiciones de entrega o recolección antes de recibir el equipo.</p>`,
      rentalDeposits: `<p>Cuando la renta requiera un depósito en garantía, conocerás su importe, forma de pago y condiciones de devolución antes de contratar. El depósito se distingue del precio de la renta. Al recibir el equipo devuelto, CEMYDI revisará su estado y accesorios para resolver el depósito conforme a lo acordado y a la ley. Cualquier descuento aplicable deberá estar justificado.</p>`,
      rentalHygiene: `<p>Al recibir el equipo revisa su estado, limpieza y accesorios. Reporta de inmediato cualquier daño, faltante o falla. Durante la renta, sigue las indicaciones de limpieza y manejo del fabricante y devuelve el equipo con sus accesorios en el estado acordado, considerando el desgaste normal de uso.</p>`,
      rentalPenalties: `<p>Devuelve el equipo en la fecha y modalidad acordadas. Si necesitas una prórroga, solicítala antes del vencimiento para que CEMYDI confirme disponibilidad y costo. Los cargos por retraso, daños, pérdida o faltantes solo proceden conforme a las condiciones informadas y aceptadas antes de contratar y a la legislación aplicable.</p>`,
      homeInstallation: `<p>Si la operación incluye instalación a domicilio, confirma previamente su cobertura, costo, horario y condiciones. Facilita el acceso y el espacio necesario para instalar el equipo. Si detectas una falla durante el uso, suspéndelo cuando hacerlo sea seguro y contacta a CEMYDI para recibir indicaciones.</p>`,
      paymentAndBilling: `<p>CEMYDI informa los medios de pago y el importe total al confirmar la operación. El catálogo, el carrito y la solicitud de renta de la app no cobran con tarjeta. Evita enviar números de tarjeta o claves bancarias mediante notas, reseñas o correo. Para solicitar tu comprobante o factura, comunica al equipo tu referencia y los datos fiscales requeridos por el canal de atención que se te indique.</p>`,
      liabilityAndSafeUse: `<p>Utiliza el equipo para su finalidad prevista y conforme a las instrucciones de uso, carga, instalación y mantenimiento. Evita modificaciones o reparaciones sin indicación del fabricante o de CEMYDI. Las obligaciones y responsabilidades de CEMYDI y del cliente se determinan conforme a la operación y la legislación aplicable. Conservas todos los derechos que la ley te otorga como consumidor.</p>`,
      intellectualProperty: `<p>El nombre, los logotipos, las fotografías y demás contenidos del catálogo pertenecen a CEMYDI o a sus respectivos titulares. Puedes consultar y compartir enlaces del catálogo. La reproducción comercial de los contenidos requiere la autorización que corresponda.</p>`,
      changesAndClaims: `<p>Las actualizaciones se publican en esta página y se aplican a operaciones futuras conforme a la ley. Para aclaraciones o reclamaciones, escribe a <a href="mailto:contacto@cemydi.com">contacto@cemydi.com</a> con tu referencia y los detalles de la operación. Puedes acudir a la Procuraduría Federal del Consumidor (Profeco) o a la autoridad competente. Se aplica la legislación mexicana.</p>`,
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
