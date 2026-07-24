\set ON_ERROR_STOP on

-- CEMYDI_DEMO_VARIANCE_V2
-- Generador local, idempotente y aditivo para las tres propuestas de analitica.
-- No renombra ni elimina columnas/tablas existentes y no modifica registros reales.

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '15min';
SET LOCAL client_min_messages = notice;

-- Evita dos ejecuciones simultaneas del mismo generador.
SELECT pg_advisory_xact_lock(hashtext('CEMYDI_DEMO_VARIANCE_V2'));

DO $validation$
DECLARE
  required_table text;
  missing_columns text;
BEGIN
  FOREACH required_table IN ARRAY ARRAY[
    'accounts.users',
    'catalog.products',
    'catalog.product_images',
    'catalog.brands',
    'catalog.classifications',
    'management.sales_orders',
    'management.sales_order_items',
    'management.rental_requests',
    'management.rental_request_items',
    'management.promotions',
    'management.reviews',
    'analytics.synthetic_batches',
    'analytics.customer_product_interactions',
    'analytics.inventory_monthly_snapshots',
    'analytics.model_runs',
    'analytics.product_recommendations',
    'analytics.customer_segments',
    'analytics.demand_forecasts'
  ]
  LOOP
    IF to_regclass(required_table) IS NULL THEN
      RAISE EXCEPTION 'Falta la tabla requerida: %', required_table;
    END IF;
  END LOOP;

  WITH required_columns(schema_name, table_name, column_name) AS (
    VALUES
      ('accounts','users','id'), ('accounts','users','correo'), ('accounts','users','createdAt'),
      ('catalog','products','id'), ('catalog','products','slug'), ('catalog','products','tipoAdquisicion'),
      ('catalog','products','rentalDailyPrice'), ('catalog','product_images','imageUrl'),
      ('management','sales_orders','batchName'), ('management','sales_orders','orderDate'),
      ('management','sales_order_items','salesOrderId'),
      ('management','rental_requests','status'), ('management','rental_request_items','rentalRequestId'),
      ('management','promotions','descripcion'), ('management','reviews','userId'),
      ('analytics','customer_product_interactions','interactionType'),
      ('analytics','customer_product_interactions','batchName'),
      ('analytics','inventory_monthly_snapshots','month'),
      ('analytics','inventory_monthly_snapshots','batchName')
  )
  SELECT string_agg(format('%I.%I.%I', r.schema_name, r.table_name, r.column_name), ', ')
  INTO missing_columns
  FROM required_columns r
  LEFT JOIN information_schema.columns c
    ON c.table_schema = r.schema_name
   AND c.table_name = r.table_name
   AND c.column_name = r.column_name
  WHERE c.column_name IS NULL;

  IF missing_columns IS NOT NULL THEN
    RAISE EXCEPTION 'Faltan columnas requeridas: %', missing_columns;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'TipoAdquisicion'
  ) THEN
    RAISE EXCEPTION 'Falta el enum public.TipoAdquisicion';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'TipoAdquisicion'
      AND e.enumlabel IN ('VENTA', 'RENTA', 'MIXTO')
  ) <> 3 THEN
    RAISE EXCEPTION 'public.TipoAdquisicion no contiene VENTA, RENTA y MIXTO';
  END IF;
END
$validation$;

-- Limpieza estrictamente limitada al lote V2.
DELETE FROM analytics.product_recommendations pr
WHERE EXISTS (
  SELECT 1 FROM analytics.model_runs mr
  WHERE mr.id = pr."modelRunId" AND mr."batchName" = 'CEMYDI_DEMO_VARIANCE_V2'
);

DELETE FROM analytics.customer_segments cs
WHERE EXISTS (
  SELECT 1 FROM analytics.model_runs mr
  WHERE mr.id = cs."modelRunId" AND mr."batchName" = 'CEMYDI_DEMO_VARIANCE_V2'
);

DELETE FROM analytics.demand_forecasts df
WHERE EXISTS (
  SELECT 1 FROM analytics.model_runs mr
  WHERE mr.id = df."modelRunId" AND mr."batchName" = 'CEMYDI_DEMO_VARIANCE_V2'
);

DELETE FROM analytics.model_runs
WHERE "batchName" = 'CEMYDI_DEMO_VARIANCE_V2';

DELETE FROM analytics.customer_product_interactions
WHERE "batchName" = 'CEMYDI_DEMO_VARIANCE_V2';

DELETE FROM analytics.inventory_monthly_snapshots
WHERE "batchName" = 'CEMYDI_DEMO_VARIANCE_V2';

DELETE FROM management.reviews r
WHERE r.comment LIKE '[CEMYDI_DEMO_VARIANCE_V2]%'
   OR r.comment = ANY(ARRAY[
        'El producto cumplio con el uso esperado y la informacion fue clara.',
        'Buena relacion entre calidad, precio y facilidad de uso.',
        'La entrega demo fue adecuada; el equipo se sintio estable.',
        'Producto practico para el cuidado diario y con acabado consistente.',
        'La opcion resulto util; conviene revisar siempre la talla o medida.'
      ])
   OR EXISTS (
        SELECT 1 FROM accounts.users u
        WHERE u.id = r."userId" AND u.correo LIKE 'demo.v2.usuario%@cemydi.local'
      )
   OR EXISTS (
        SELECT 1 FROM catalog.products p
        WHERE p.id = r."productId" AND p.slug LIKE 'demo-variance-%'
      );

DELETE FROM management.promotions p
WHERE p.descripcion LIKE '[CEMYDI_DEMO_VARIANCE_V2]%'
   OR EXISTS (
        SELECT 1 FROM catalog.products product
        WHERE product.id = p."productId" AND product.slug LIKE 'demo-variance-%'
      );

DELETE FROM management.rental_requests
WHERE id LIKE 'demo-v2-rental-%';

DELETE FROM management.sales_orders
WHERE "batchName" = 'CEMYDI_DEMO_VARIANCE_V2'
   OR id LIKE 'demo-v2-sale-%';

DELETE FROM analytics.synthetic_batches
WHERE "batchName" = 'CEMYDI_DEMO_VARIANCE_V2';

DELETE FROM catalog.products
WHERE slug LIKE 'demo-variance-%';

DELETE FROM accounts.users
WHERE correo LIKE 'demo.v2.usuario%@cemydi.local';

INSERT INTO analytics.synthetic_batches (
  "batchName", description, "periodStart", "periodEnd", "createdAt"
)
VALUES (
  'CEMYDI_DEMO_VARIANCE_V2',
  'Lote ficticio local con varianza controlada para recomendacion, clustering y regresion de demanda.',
  DATE '2023-07-01',
  DATE '2026-06-30',
  TIMESTAMP '2026-06-30 23:00:00'
);

-- 600 usuarios nuevos. Sus fechas de alta preceden cualquier actividad que se les asigne.
WITH source_password AS (
  SELECT COALESCE(
    (SELECT password FROM accounts.users WHERE correo LIKE 'demo.usuario%@cemydi.local' ORDER BY id LIMIT 1),
    '$2b$12$CEMYDIDemoHashOnlyForSyntheticUsers000000000000000000000'
  ) AS password_hash
), names AS (
  SELECT
    ARRAY['Ana','Luis','Maria','Carlos','Sofia','Jorge','Elena','Miguel','Valeria','Ricardo',
          'Daniela','Fernando','Paola','Hector','Camila','Arturo','Renata','Oscar','Lucia','Andres']::text[] AS first_names,
    ARRAY['Garcia','Hernandez','Lopez','Martinez','Gonzalez','Perez','Rodriguez','Sanchez','Ramirez','Cruz',
          'Flores','Gomez','Morales','Vazquez','Reyes','Torres','Jimenez','Mendoza','Castillo','Ortega']::text[] AS last_names
)
INSERT INTO accounts.users (
  nombre, correo, password, telefono, direccion, rol, "createdAt", activo, "emailVerifiedAt"
)
SELECT
  names.first_names[1 + ((g.i - 1) % array_length(names.first_names, 1))]
    || ' '
    || names.last_names[1 + (((g.i - 1) * 7) % array_length(names.last_names, 1))]
    || ' Demo V2',
  format('demo.v2.usuario%s@cemydi.local', lpad(g.i::text, 4, '0')),
  source_password.password_hash,
  '55' || lpad(((10000000 + g.i * 7919) % 100000000)::text, 8, '0'),
  format('Calle Demostracion %s, Col. Salud %s, Ciudad de Mexico', 10 + (g.i % 190), 1 + (g.i % 12)),
  'CLIENT'::public."Rol",
  TIMESTAMP '2023-07-01 09:00:00' + ((g.i - 1) % 3) * INTERVAL '1 day',
  true,
  TIMESTAMP '2023-07-01 10:00:00' + ((g.i - 1) % 3) * INTERVAL '1 day'
FROM generate_series(1, 600) AS g(i)
CROSS JOIN source_password
CROSS JOIN names;

-- Catalogos auxiliares. Products conserva strings por compatibilidad con Prisma.
INSERT INTO catalog.brands (nombre, "createdAt")
SELECT brand, TIMESTAMP '2023-07-01 08:00:00'
FROM unnest(ARRAY[
  'MoviCare','OrtoPlus','RespiraMed','CasaSegura','FlexOrtho','RehabPro',
  'DiagnoHome','BanoVital','PulmoCare','PosturaMed','PediaMove','GeriaConfort'
]) AS brand
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO catalog.classifications (nombre, "createdAt")
SELECT classification, TIMESTAMP '2023-07-01 08:00:00'
FROM unnest(ARRAY[
  'Movilidad','Apoyo para caminar','Oxigenoterapia','Cuidado en casa',
  'Ortesis','Rehabilitación','Diagnóstico','Baño y seguridad',
  'Terapia respiratoria','Postoperatorio','Pediatría','Geriatría'
]) AS classification
ON CONFLICT (nombre) DO NOTHING;

CREATE TEMP TABLE _v2_product_seed (
  seed_no integer PRIMARY KEY,
  product_name text NOT NULL,
  classification text NOT NULL,
  base_price double precision NOT NULL,
  material text NOT NULL,
  measures text NOT NULL,
  supported_weight text,
  box_contents text NOT NULL,
  use_indications text NOT NULL,
  prescription boolean NOT NULL
) ON COMMIT DROP;

INSERT INTO _v2_product_seed VALUES
  ( 1,'Silla de ruedas plegable aluminio','Movilidad',6850,'Aluminio y nylon','Ancho 46 cm; rueda 24 in','120 kg','Silla, descansapies y manual','Traslado cotidiano en interiores y exteriores',false),
  ( 2,'Silla de ruedas bariatrica reforzada','Movilidad',18400,'Acero reforzado','Ancho 56 cm; rueda 24 in','220 kg','Silla, cojin y descansapies','Movilidad asistida para usuarios bariatricos',false),
  ( 3,'Scooter electrico compacto','Movilidad',38900,'Acero, ABS y bateria de litio','104 x 51 x 92 cm','136 kg','Scooter, cargador y canastilla','Recorridos cortos con supervision inicial',false),
  ( 4,'Transportadora de paciente ultraligera','Movilidad',8250,'Aluminio y poliester','Plegada 74 x 28 cm','100 kg','Transportadora, cinturon y bolsa','Traslados breves con acompanante',false),
  ( 5,'Baston ergonomico de altura ajustable','Apoyo para caminar',520,'Aluminio y elastomero','Altura 72 a 95 cm','110 kg','Baston, regaton y correa','Apoyo unilateral durante la marcha',false),
  ( 6,'Andadera plegable con ruedas','Apoyo para caminar',1780,'Aluminio anodizado','Altura 78 a 96 cm','130 kg','Andadera y dos ruedas frontales','Marcha asistida y rehabilitacion ambulatoria',false),
  ( 7,'Muletas canadienses amortiguadas','Apoyo para caminar',1350,'Aluminio y polipropileno','Altura 92 a 124 cm','125 kg','Par de muletas y regatones','Descarga parcial de miembro inferior',false),
  ( 8,'Rollator con asiento y frenos','Apoyo para caminar',4650,'Aluminio y tela tecnica','61 x 68 x 82 a 94 cm','140 kg','Rollator, asiento y bolsa','Apoyo continuo con pausas de descanso',false),
  ( 9,'Concentrador de oxigeno 5 litros','Oxigenoterapia',19800,'ABS grado medico','35 x 28 x 58 cm',NULL,'Concentrador, canula y humidificador','Oxigenoterapia domiciliaria segun prescripcion',true),
  (10,'Cilindro portatil de oxigeno con carro','Oxigenoterapia',7200,'Aluminio y laton','Cilindro 40 cm; carro plegable',NULL,'Cilindro demo, regulador y carro','Respaldo portatil para suministro de oxigeno',true),
  (11,'Regulador de oxigeno con flujometro','Oxigenoterapia',2450,'Laton cromado y policarbonato','Flujo 0 a 15 L/min',NULL,'Regulador, vaso y empaque','Control de flujo en cilindros compatibles',true),
  (12,'Canula nasal suave paquete mensual','Oxigenoterapia',390,'PVC grado medico','Tubo 2.1 m',NULL,'Cinco canulas y conectores','Administracion de oxigeno de bajo flujo',true),
  (13,'Cama hospitalaria manual tres posiciones','Cuidado en casa',22400,'Acero con pintura epoxica','203 x 96 cm','180 kg','Cama, barandales y manivelas','Cuidado prolongado y cambios posturales',false),
  (14,'Mesa puente ajustable para cama','Cuidado en casa',2650,'Acero y cubierta ABS','76 x 40 x 72 a 105 cm','20 kg sobre cubierta','Mesa, base rodable y manual','Alimentacion y actividades junto a cama',false),
  (15,'Colchon antiescaras de presion alterna','Cuidado en casa',3750,'PVC sanitario y nylon','190 x 85 cm','135 kg','Colchon, compresor y mangueras','Prevencion complementaria de lesiones por presion',false),
  (16,'Grua hidraulica para traslado domiciliario','Cuidado en casa',27900,'Acero y arnes textil','Base 112 x 64 cm','180 kg','Grua, arnes y manual','Transferencias con cuidador capacitado',false),
  (17,'Rodillera articulada con control de rango','Ortesis',3200,'Neopreno, aluminio y velcro','Tallas S a XL',NULL,'Rodillera y topes de flexion','Estabilizacion de rodilla en recuperacion',true),
  (18,'Faja lumbosacra semirrígida','Ortesis',1450,'Textil elastico y varillas','Tallas CH a EG',NULL,'Faja y guia de ajuste','Soporte lumbar temporal durante actividad',false),
  (19,'Bota walker neumática','Ortesis',2850,'Polipropileno, espuma y aluminio','Tallas CH a G',NULL,'Bota, bomba y protectores','Inmovilizacion funcional bajo indicacion clinica',true),
  (20,'Ferula nocturna para fascitis plantar','Ortesis',980,'Polipropileno y espuma','Tallas CH a G',NULL,'Ferula y correas','Estiramiento pasivo nocturno del pie',false),
  (21,'Pedalera digital para rehabilitacion','Rehabilitación',2350,'Acero y ABS','48 x 40 x 30 cm','100 kg de resistencia de uso','Pedalera, pantalla y correa','Ejercicio suave de brazos o piernas',false),
  (22,'Electroestimulador TENS de cuatro canales','Rehabilitación',4650,'ABS y electrodos de hidrogel','Equipo 15 x 9 cm',NULL,'Unidad, cables y ocho electrodos','Analgesia complementaria supervisada',true),
  (23,'Banda elastica terapeutica set progresivo','Rehabilitación',690,'Latex natural','Cinco resistencias de 1.5 m',NULL,'Cinco bandas y estuche','Fortalecimiento progresivo y movilidad',false),
  (24,'Caminadora de rehabilitacion con pasamanos','Rehabilitación',34200,'Acero y PVC','154 x 70 x 125 cm','150 kg','Caminadora, pasamanos y llave','Marcha terapeutica en entorno supervisado',true),
  (25,'Baumanometro digital de brazo','Diagnóstico',1380,'ABS y brazalete textil','Brazalete 22 a 42 cm',NULL,'Monitor, brazalete y baterias','Monitoreo domiciliario de presion arterial',false),
  (26,'Oximetro de pulso pediatrico','Diagnóstico',1120,'ABS y silicona','Dedo de 8 a 18 mm',NULL,'Oximetro, correa y baterias','Lectura orientativa de saturacion y pulso',false),
  (27,'Glucómetro con conectividad','Diagnóstico',890,'ABS y componentes electronicos','Equipo 9 x 5 cm',NULL,'Medidor, lancetero y diez tiras','Autocontrol de glucosa segun plan clinico',false),
  (28,'Monitor de signos vitales multiparametrico','Diagnóstico',36500,'ABS grado medico','30 x 27 x 16 cm',NULL,'Monitor, sensores y cable de energia','Vigilancia de parametros por personal capacitado',true),
  (29,'Silla comodo ducha con ruedas','Baño y seguridad',4950,'Aluminio y poliuretano','Ancho 55 cm','120 kg','Silla, cubeta y descansapies','Aseo y traslado seguro en baño',false),
  (30,'Banco de baño ajustable antideslizante','Baño y seguridad',1280,'Aluminio y polietileno','Altura 38 a 52 cm','135 kg','Banco y respaldo','Apoyo durante ducha en superficie nivelada',false),
  (31,'Barra de seguridad abatible','Baño y seguridad',1850,'Acero inoxidable','Longitud 70 cm','120 kg','Barra, placa y tornilleria','Apoyo lateral instalado en muro firme',false),
  (32,'Elevador de inodoro con descansabrazos','Baño y seguridad',2150,'Polipropileno y aluminio','Elevacion 12 cm','130 kg','Elevador, brazos y seguros','Facilitar sentado y levantado del sanitario',false),
  (33,'Nebulizador compresor silencioso','Terapia respiratoria',1750,'ABS y PVC medico','Equipo 17 x 14 cm',NULL,'Compresor, vaso, mascaras y tubo','Nebulizacion domiciliaria de medicamentos prescritos',true),
  (34,'Incentivador respiratorio volumetrico','Terapia respiratoria',460,'Policarbonato y PVC','Capacidad 4000 ml',NULL,'Incentivador, boquilla y tubo','Ejercicios de inspiracion profunda',false),
  (35,'Aspirador de secreciones portatil','Terapia respiratoria',8950,'ABS y bomba electrica','28 x 19 x 21 cm',NULL,'Aspirador, frasco y manguera','Aspiracion por cuidador capacitado',true),
  (36,'CPAP automatico con humidificador','Terapia respiratoria',23800,'ABS y silicona','Equipo 27 x 18 x 11 cm',NULL,'CPAP, humidificador, tubo y mascarilla','Terapia de presion positiva prescrita',true),
  (37,'Cojin abductor postoperatorio','Postoperatorio',980,'Espuma de alta densidad','45 x 35 x 15 cm',NULL,'Cojin y correas','Mantener separacion de piernas tras cirugia',false),
  (38,'Media de compresion graduada par','Postoperatorio',760,'Nylon y elastano','Compresion 20 a 30 mmHg',NULL,'Par de medias y guia','Compresion posoperatoria bajo indicacion',true),
  (39,'Cabestrillo inmovilizador universal','Postoperatorio',540,'Algodon, espuma y velcro','Ajuste universal',NULL,'Cabestrillo y banda toracica','Soporte temporal de hombro y brazo',false),
  (40,'Sistema de crioterapia con compresion','Postoperatorio',12800,'ABS, nylon y deposito termico','Deposito 6 L',NULL,'Unidad, manguera y rodillera','Frio terapeutico intermitente supervisado',true),
  (41,'Andadera posterior pediatrica','Pediatría',6850,'Aluminio y poliuretano','Altura 48 a 65 cm','60 kg','Andadera y ruedas con bloqueo','Entrenamiento de marcha pediatrica',true),
  (42,'Silla de ruedas infantil reclinable','Pediatría',24600,'Aluminio y tela respirable','Asiento 32 cm','75 kg','Silla, cinturon y soporte cefalico','Movilidad pediatrica con evaluacion profesional',true),
  (43,'Ferula de mano pediatrica moldeable','Pediatría',1250,'Termoplastico y velcro','Tallas infantil 1 a 3',NULL,'Ferula y correas','Posicionamiento de mano bajo indicacion',true),
  (44,'Nebulizador infantil diseño amigable','Pediatría',1980,'ABS y PVC medico','Equipo 15 x 13 cm',NULL,'Compresor, mascara infantil y tubo','Nebulizacion pediatrica prescrita',true),
  (45,'Sillon geriatrico reclinable con ruedas','Geriatría',16900,'Acero, espuma y vinil','Ancho 68 cm','150 kg','Sillon, charola y descansapies','Descanso y traslado asistido en interiores',false),
  (46,'Alarma de movimiento para cuidador','Geriatría',2150,'ABS y sensor inalambrico','Sensor 8 x 5 cm',NULL,'Sensor, receptor y baterias','Aviso de movimiento o salida de cama',false),
  (47,'Organizador semanal de medicamentos','Geriatría',280,'Polipropileno','28 compartimentos',NULL,'Organizador y etiquetas','Organizacion de tomas segun prescripcion',false),
  (48,'Cojin antideslizante de posicionamiento','Geriatría',1480,'Espuma viscoelastica y gel','45 x 43 x 8 cm','130 kg','Cojin y funda lavable','Mejorar apoyo en sedestacion prolongada',false);

WITH enriched AS (
  SELECT
    s.*,
    (ARRAY['MoviCare','OrtoPlus','RespiraMed','CasaSegura','FlexOrtho','RehabPro',
           'DiagnoHome','BanoVital','PulmoCare','PosturaMed','PediaMove','GeriaConfort'])[1 + ((s.seed_no - 1) % 12)] AS brand,
    CASE
      WHEN (s.seed_no * 7) % 10 BETWEEN 0 AND 3 THEN 'VENTA'
      WHEN (s.seed_no * 7) % 10 BETWEEN 4 AND 6 THEN 'RENTA'
      ELSE 'MIXTO'
    END AS acquisition_type
  FROM _v2_product_seed s
)
INSERT INTO catalog.products (
  nombre, slug, marca, modelo, descripcion, medidas, "pesoSoportado", material,
  "contenidoCaja", "indicacionesUso", precio, clasificacion, stock, proveedor,
  "tipoAdquisicion", "requiereReceta", "rentalDailyPrice", "rentalMinDays",
  "rentalDeposit", "rentalTerms", "createdAt", activo
)
SELECT
  e.product_name,
  'demo-variance-' || lpad(e.seed_no::text, 3, '0') || '-' ||
    trim(both '-' from regexp_replace(
      translate(lower(e.product_name), 'áéíóúñü', 'aeiounu'), '[^a-z0-9]+', '-', 'g'
    )),
  e.brand,
  format('CEMYDI-V2-%s', lpad(e.seed_no::text, 3, '0')),
  format('%s. Producto ficticio de demostracion con especificaciones variables para analitica CEMYDI.', e.use_indications),
  e.measures,
  e.supported_weight,
  e.material,
  e.box_contents,
  e.use_indications,
  e.base_price,
  e.classification,
  CASE
    WHEN e.base_price <= 1500 THEN 30 + ((e.seed_no * 17) % 66)
    WHEN e.base_price <= 8000 THEN 12 + ((e.seed_no * 13) % 39)
    ELSE 3 + ((e.seed_no * 7) % 16)
  END,
  (ARRAY['Distribuidora Centro','Suministros Medicos del Valle','Ortopedia Integral MX','Equipos Clinicos del Sur'])[1 + ((e.seed_no - 1) % 4)],
  e.acquisition_type::public."TipoAdquisicion",
  e.prescription,
  CASE WHEN e.acquisition_type IN ('RENTA','MIXTO')
       THEN round((greatest(65, e.base_price * (0.010 + (e.seed_no % 5) * 0.0015)))::numeric, 2)::double precision
       ELSE NULL END,
  1 + (e.seed_no % 4),
  CASE WHEN e.acquisition_type IN ('RENTA','MIXTO')
       THEN round((e.base_price * (0.12 + (e.seed_no % 4) * 0.03))::numeric, 2)::double precision
       ELSE 0 END,
  CASE WHEN e.acquisition_type IN ('RENTA','MIXTO')
       THEN 'Uso demostrativo. Requiere identificacion, revision de entrega y devolucion en condiciones acordadas.'
       ELSE NULL END,
  TIMESTAMP '2023-07-01 08:00:00',
  true
FROM enriched e;

WITH image_map(seed_no, source_product_id) AS (
  VALUES
    (1,7),(2,7),(3,8),(4,7),
    (5,5),(6,6),(7,1),(8,6),
    (9,3),(10,9),(11,24),(12,3),
    (13,14),(14,14),(15,15),(16,14),
    (17,18),(18,17),(19,19),(20,17),
    (21,6),(22,18),(23,1),(24,6),
    (25,11),(26,10),(27,13),(28,11),
    (29,16),(30,20),(31,25),(32,16),
    (33,2),(34,2),(35,4),(36,3),
    (37,15),(38,17),(39,19),(40,18),
    (41,6),(42,7),(43,17),(44,2),
    (45,16),(46,12),(47,13),(48,15)
), source_images AS (
  SELECT
    m.seed_no,
    pi."imageUrl"
  FROM image_map m
  JOIN LATERAL (
    SELECT source_pi."imageUrl"
    FROM catalog.product_images source_pi
    WHERE source_pi."productId" = m.source_product_id
      AND source_pi."imageUrl" LIKE 'https://res.cloudinary.com/%'
    ORDER BY source_pi."sortOrder", source_pi.id
    LIMIT 1
  ) pi ON true
)
INSERT INTO catalog.product_images (
  "productId", "imageUrl", "cloudinaryPublicId", "sortOrder", "createdAt"
)
SELECT
  p.id,
  si."imageUrl" || CASE WHEN position('?' IN si."imageUrl") = 0 THEN '?' ELSE '&' END
    || 'cemydi_demo_v2=' || lpad(s.seed_no::text, 3, '0'),
  NULL,
  0,
  TIMESTAMP '2023-07-01 08:30:00'
FROM catalog.products p
JOIN _v2_product_seed s ON s.product_name = p.nombre
JOIN source_images si ON si.seed_no = s.seed_no
WHERE p.slug LIKE 'demo-variance-%';

-- Perfiles generadores temporales; no son clusters entrenados ni se persisten.
CREATE TEMP TABLE _v2_users ON COMMIT DROP AS
WITH ranked AS (
  SELECT
    u.id AS user_id,
    u.correo,
    u."createdAt" AS created_at,
    row_number() OVER (ORDER BY hashtextextended(u.correo, 2026), u.id) AS rn,
    count(*) OVER () AS total_users
  FROM accounts.users u
  WHERE u.correo LIKE 'demo.usuario%@cemydi.local'
     OR u.correo LIKE 'demo.v2.usuario%@cemydi.local'
)
SELECT
  user_id,
  correo,
  created_at,
  CASE
    WHEN rn <= ceil(total_users * 0.20) THEN 'A_FREQUENT_BUYER'
    WHEN rn <= ceil(total_users * 0.40) THEN 'B_RECURRING_RENTER'
    WHEN rn <= ceil(total_users * 0.55) THEN 'C_MIXED'
    WHEN rn <= ceil(total_users * 0.75) THEN 'D_EXPLORER'
    WHEN rn <= ceil(total_users * 0.90) THEN 'E_OCCASIONAL'
    ELSE 'F_INACTIVE'
  END AS generator_profile
FROM ranked;

CREATE INDEX ON _v2_users (user_id);
CREATE INDEX ON _v2_users (created_at);

CREATE TEMP TABLE _v2_products ON COMMIT DROP AS
WITH ranked AS (
  SELECT
    p.id AS product_id,
    p.nombre AS product_name,
    p.clasificacion AS classification,
    p."tipoAdquisicion"::text AS acquisition_type,
    p.precio AS unit_price,
    CASE
      WHEN p."tipoAdquisicion" IN ('RENTA'::public."TipoAdquisicion", 'MIXTO'::public."TipoAdquisicion")
        THEN COALESCE(p."rentalDailyPrice", greatest(50, p.precio * 0.012))
      ELSE NULL
    END AS rental_daily_price,
    p.stock AS initial_stock,
    p."requiereReceta" AS requires_prescription,
    row_number() OVER (ORDER BY hashtextextended(p.slug, 2026), p.id) AS rn,
    count(*) OVER () AS total_products,
    0.65 + (mod(abs(hashtextextended(p.slug, 31)::numeric), 86) / 100.0) AS popularity,
    CASE
      WHEN p.precio <= 1500 THEN 8 + mod(abs(hashtextextended(p.slug, 41)::numeric), 11)::integer
      WHEN p.precio <= 8000 THEN 3 + mod(abs(hashtextextended(p.slug, 43)::numeric), 6)::integer
      ELSE 1 + mod(abs(hashtextextended(p.slug, 47)::numeric), 4)::integer
    END AS base_level,
    CASE
      WHEN p.precio > 8000 THEN 0.65 + mod(abs(hashtextextended(p.slug, 53)::numeric), 46) / 100.0
      WHEN p.precio > 1500 AND mod(abs(hashtextextended(p.slug, 53)::numeric), 29) = 0 THEN 1.80
      WHEN mod(abs(hashtextextended(p.slug, 53)::numeric), 29) = 0 THEN 2.35
      ELSE 0.80 + mod(abs(hashtextextended(p.slug, 59)::numeric), 61) / 100.0
    END AS rotation_factor
  FROM catalog.products p
  WHERE p.activo = true
)
SELECT
  ranked.*,
  CASE
    WHEN rn <= ceil(total_products * 0.25) THEN 'STABLE'
    WHEN rn <= ceil(total_products * 0.45) THEN 'GROWTH'
    WHEN rn <= ceil(total_products * 0.60) THEN 'DECLINE'
    WHEN rn <= ceil(total_products * 0.80) THEN 'SEASONAL'
    WHEN rn <= ceil(total_products * 0.90) THEN 'INTERMITTENT'
    ELSE 'PROMOTION_SENSITIVE'
  END AS demand_pattern,
  greatest(2, least(16, round(base_level * 0.55)::integer)) AS minimum_stock
FROM ranked;

CREATE INDEX ON _v2_products (product_id);

CREATE TEMP TABLE _v2_signals ON COMMIT DROP AS
WITH calendar AS (
  SELECT
    month_start::date AS month,
    row_number() OVER (ORDER BY month_start)::integer - 1 AS month_index
  FROM generate_series(DATE '2023-07-01', DATE '2026-06-01', INTERVAL '1 month') month_start
), factors AS (
  SELECT
    p.*,
    c.month,
    c.month_index,
    EXTRACT(month FROM c.month)::integer AS calendar_month,
    CASE p.demand_pattern
      WHEN 'GROWTH' THEN 0.72 + c.month_index * (0.78 / 35.0)
      WHEN 'DECLINE' THEN 1.48 - c.month_index * (0.73 / 35.0)
      WHEN 'STABLE' THEN 0.94 + mod(c.month_index + p.product_id, 5) * 0.03
      WHEN 'INTERMITTENT' THEN 0.88 + mod(c.month_index + p.product_id, 4) * 0.09
      ELSE 0.92 + c.month_index * (0.18 / 35.0)
    END AS trend_factor,
    CASE
      WHEN p.classification IN ('Oxigenoterapia','Terapia respiratoria')
           AND EXTRACT(month FROM c.month) IN (11,12,1,2) THEN 1.75
      WHEN p.classification IN ('Rehabilitación','Rehabilitacion')
           AND EXTRACT(month FROM c.month) IN (3,4,5,9,10) THEN 1.42
      WHEN p.classification IN ('Diagnóstico','Diagnostico')
           AND EXTRACT(month FROM c.month) IN (1,7,12) THEN 1.55
      WHEN p.classification = 'Baño y seguridad' THEN 1.0 + c.month_index * 0.012
      WHEN p.demand_pattern = 'SEASONAL'
           AND EXTRACT(month FROM c.month) IN (5,6,11,12) THEN 1.48
      ELSE 0.88 + mod(c.month_index + p.product_id, 7) * 0.04
    END AS seasonal_factor,
    CASE
      WHEN p.demand_pattern = 'PROMOTION_SENSITIVE' AND c.month_index % 6 = 5 THEN true
      WHEN p.demand_pattern <> 'INTERMITTENT'
       AND mod(abs(hashtextextended(p.product_id::text || c.month::text, 67)::numeric), 23) = 0 THEN true
      ELSE false
    END AS active_promotion
  FROM _v2_products p
  CROSS JOIN calendar c
), strength AS (
  SELECT
    f.*,
    f.base_level * f.popularity * f.trend_factor * f.seasonal_factor AS signal_strength
  FROM factors f
)
SELECT
  s.product_id,
  s.product_name,
  s.classification,
  s.acquisition_type,
  s.unit_price,
  s.rental_daily_price,
  s.initial_stock,
  s.minimum_stock,
  s.base_level,
  s.rotation_factor,
  s.demand_pattern,
  s.month,
  s.month_index,
  s.active_promotion,
  s.signal_strength,
  greatest(0, least(28,
    round(s.signal_strength * 0.62
      + (mod(abs(hashtextextended(s.product_id::text || s.month::text, 71)::numeric), 7) - 3))
  ))::integer AS views,
  greatest(0, least(16,
    round((s.signal_strength * 0.62) * (0.22 + mod(abs(hashtextextended(s.product_id::text || s.month::text, 73)::numeric), 28) / 100.0))
  ))::integer AS searches,
  greatest(0, least(9,
    round((s.signal_strength * 0.62) * (0.08 + mod(abs(hashtextextended(s.product_id::text || s.month::text, 79)::numeric), 18) / 100.0))
  ))::integer AS add_to_cart,
  greatest(0, least(6,
    round((s.signal_strength * 0.62) * (0.04 + mod(abs(hashtextextended(s.product_id::text || s.month::text, 83)::numeric), 12) / 100.0))
  ))::integer AS favorites,
  greatest(0, least(3,
    round((s.signal_strength * 0.62) * (0.01 + mod(abs(hashtextextended(s.product_id::text || s.month::text, 89)::numeric), 7) / 100.0))
  ))::integer AS shares
FROM strength s;

CREATE INDEX ON _v2_signals (product_id, month_index);

CREATE TEMP TABLE _v2_monthly ON COMMIT DROP AS
WITH RECURSIVE demand_series(
  product_id, month, month_index, demand_pattern, acquisition_type,
  unit_price, rental_daily_price, minimum_stock, active_promotion,
  views, searches, add_to_cart, favorites, shares, signal_strength,
  monthly_demand, units_sold, units_rented
) AS (
  SELECT
    s.product_id, s.month, s.month_index, s.demand_pattern, s.acquisition_type,
    s.unit_price, s.rental_daily_price, s.minimum_stock, s.active_promotion,
    s.views, s.searches, s.add_to_cart, s.favorites, s.shares, s.signal_strength,
    d.monthly_demand,
    CASE
      WHEN s.acquisition_type = 'VENTA' THEN d.monthly_demand
      WHEN s.acquisition_type = 'RENTA' THEN 0
      ELSE round(d.monthly_demand * (0.40 + mod(abs(hashtextextended(s.product_id::text || s.month::text, 97)::numeric), 30) / 100.0))::integer
    END AS units_sold,
    CASE
      WHEN s.acquisition_type = 'RENTA' THEN d.monthly_demand
      WHEN s.acquisition_type = 'VENTA' THEN 0
      ELSE d.monthly_demand - round(d.monthly_demand * (0.40 + mod(abs(hashtextextended(s.product_id::text || s.month::text, 97)::numeric), 30) / 100.0))::integer
    END AS units_rented
  FROM _v2_signals s
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN s.demand_pattern = 'INTERMITTENT' AND mod(s.month_index + s.product_id, 5) IN (0,1,2) THEN 0
      ELSE least(120, greatest(0, round(
        s.signal_strength * s.rotation_factor * (CASE WHEN s.active_promotion THEN 1.55 ELSE 0.82 END)
        + s.views * 0.12 + s.searches * 0.10 + s.add_to_cart * 0.24
        + (mod(abs(hashtextextended(s.product_id::text || s.month::text, 101)::numeric), 9) - 4)
      )))::integer
    END AS monthly_demand
  ) d
  WHERE s.month_index = 0

  UNION ALL

  SELECT
    s.product_id, s.month, s.month_index, s.demand_pattern, s.acquisition_type,
    s.unit_price, s.rental_daily_price, s.minimum_stock, s.active_promotion,
    s.views, s.searches, s.add_to_cart, s.favorites, s.shares, s.signal_strength,
    d.monthly_demand,
    CASE
      WHEN s.acquisition_type = 'VENTA' THEN d.monthly_demand
      WHEN s.acquisition_type = 'RENTA' THEN 0
      ELSE round(d.monthly_demand * (0.40 + mod(abs(hashtextextended(s.product_id::text || s.month::text, 103)::numeric), 30) / 100.0))::integer
    END,
    CASE
      WHEN s.acquisition_type = 'RENTA' THEN d.monthly_demand
      WHEN s.acquisition_type = 'VENTA' THEN 0
      ELSE d.monthly_demand - round(d.monthly_demand * (0.40 + mod(abs(hashtextextended(s.product_id::text || s.month::text, 103)::numeric), 30) / 100.0))::integer
    END
  FROM demand_series previous
  JOIN _v2_signals s
    ON s.product_id = previous.product_id
   AND s.month_index = previous.month_index + 1
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN s.demand_pattern = 'INTERMITTENT' AND mod(s.month_index + s.product_id, 5) IN (0,1,2) THEN 0
      ELSE least(120, greatest(0, round(
        (
          s.signal_strength * 0.50
          + previous.views * 0.15
          + previous.searches * 0.12
          + previous.add_to_cart * 0.35
          + previous.units_sold * 0.08
          + previous.units_rented * 0.12
          + previous.monthly_demand * 0.18
          + CASE WHEN s.active_promotion THEN greatest(4, s.base_level * 0.65) ELSE 0 END
          + (mod(abs(hashtextextended(s.product_id::text || s.month::text, 107)::numeric), 11) - 5)
        ) * s.rotation_factor
      )))::integer
    END AS monthly_demand
  ) d
)
SELECT * FROM demand_series;

CREATE INDEX ON _v2_monthly (product_id, month);

CREATE TEMP TABLE _v2_inventory ON COMMIT DROP AS
WITH RECURSIVE stock_series(product_id, month, month_index, stock_available) AS (
  SELECT
    m.product_id,
    m.month,
    m.month_index,
    greatest(0,
      greatest(p.initial_stock, p.base_level * 3)
      + CASE WHEN m.active_promotion THEN p.base_level ELSE round(p.base_level * 0.45)::integer END
      - m.monthly_demand
    )::integer
  FROM _v2_monthly m
  JOIN _v2_products p ON p.product_id = m.product_id
  WHERE m.month_index = 0

  UNION ALL

  SELECT
    m.product_id,
    m.month,
    m.month_index,
    greatest(0,
      previous.stock_available
      - m.monthly_demand
      + CASE
          WHEN previous.stock_available <= m.minimum_stock
            THEN m.monthly_demand + m.minimum_stock + p.base_level
          WHEN m.month_index % 3 = 0
            THEN round(m.monthly_demand * 0.82 + p.base_level)::integer
          ELSE round(m.monthly_demand * 0.28)::integer
        END
    )::integer
  FROM stock_series previous
  JOIN _v2_monthly m
    ON m.product_id = previous.product_id
   AND m.month_index = previous.month_index + 1
  JOIN _v2_products p ON p.product_id = m.product_id
)
SELECT * FROM stock_series;

CREATE INDEX ON _v2_inventory (product_id, month);

-- Promociones mensuales selectivas; la etiqueta permite limpiar solo V2.
INSERT INTO management.promotions (
  "productId", "startAt", "endAt", "imageUrl", "createdAt", descripcion
)
SELECT
  m.product_id,
  m.month + INTERVAL '5 days',
  (m.month + INTERVAL '1 month - 4 days')::timestamp,
  img."imageUrl",
  m.month + INTERVAL '1 day',
  format('[CEMYDI_DEMO_VARIANCE_V2] Promocion controlada %s para %s.',
         to_char(m.month, 'YYYY-MM'), p.product_name)
FROM _v2_monthly m
JOIN _v2_products p ON p.product_id = m.product_id
LEFT JOIN LATERAL (
  SELECT pi."imageUrl"
  FROM catalog.product_images pi
  WHERE pi."productId" = m.product_id
  ORDER BY pi."sortOrder", pi.id
  LIMIT 1
) img ON true
WHERE m.active_promotion;

INSERT INTO analytics.inventory_monthly_snapshots (
  "productId", month, "stockAvailable", "stockReserved", "minimumStock",
  "unitPrice", "rentalDailyPrice", "activePromotion", "batchName", "createdAt"
)
SELECT
  m.product_id,
  m.month,
  i.stock_available,
  least(i.stock_available, mod(abs(hashtextextended(m.product_id::text || m.month::text, 109)::numeric), 5)::integer),
  m.minimum_stock,
  round((m.unit_price * (1 + (m.month_index / 35.0) * 0.045))::numeric, 2)::double precision,
  CASE WHEN m.rental_daily_price IS NULL THEN NULL
       ELSE round((m.rental_daily_price * (1 + (m.month_index / 35.0) * 0.035))::numeric, 2)::double precision END,
  m.active_promotion,
  'CEMYDI_DEMO_VARIANCE_V2',
  m.month + INTERVAL '27 days'
FROM _v2_monthly m
JOIN _v2_inventory i ON i.product_id = m.product_id AND i.month = m.month;

-- Pools ponderados por mes. Ademas de variar volumen, respetan createdAt del usuario.
CREATE TEMP TABLE _v2_sale_slots ON COMMIT DROP AS
WITH months AS (SELECT DISTINCT month FROM _v2_monthly), expanded AS (
  SELECT m.month, u.user_id, u.generator_profile, weight.rep
  FROM months m
  JOIN _v2_users u ON u.created_at::date <= m.month + 4
  CROSS JOIN LATERAL generate_series(1, CASE u.generator_profile
    WHEN 'A_FREQUENT_BUYER' THEN 6 WHEN 'C_MIXED' THEN 4
    WHEN 'E_OCCASIONAL' THEN 2 WHEN 'D_EXPLORER' THEN 1
    WHEN 'B_RECURRING_RENTER' THEN 1 ELSE 0 END) weight(rep)
)
SELECT month, user_id, generator_profile,
       row_number() OVER (PARTITION BY month ORDER BY user_id, rep) AS slot_no,
       count(*) OVER (PARTITION BY month) AS slot_count
FROM expanded;

CREATE TEMP TABLE _v2_rental_slots ON COMMIT DROP AS
WITH months AS (SELECT DISTINCT month FROM _v2_monthly), expanded AS (
  SELECT m.month, u.user_id, u.generator_profile, weight.rep
  FROM months m
  JOIN _v2_users u ON u.created_at::date <= m.month + 1
  CROSS JOIN LATERAL generate_series(1, CASE u.generator_profile
    WHEN 'B_RECURRING_RENTER' THEN 6 WHEN 'C_MIXED' THEN 4
    WHEN 'E_OCCASIONAL' THEN 2 WHEN 'D_EXPLORER' THEN 1
    WHEN 'A_FREQUENT_BUYER' THEN 1 ELSE 0 END) weight(rep)
)
SELECT month, user_id, generator_profile,
       row_number() OVER (PARTITION BY month ORDER BY user_id, rep) AS slot_no,
       count(*) OVER (PARTITION BY month) AS slot_count
FROM expanded;

CREATE TEMP TABLE _v2_interaction_slots ON COMMIT DROP AS
WITH months AS (SELECT DISTINCT month FROM _v2_monthly), expanded AS (
  SELECT m.month, u.user_id, u.generator_profile, weight.rep
  FROM months m
  JOIN _v2_users u
    ON u.created_at::date <= m.month
   AND (u.generator_profile <> 'F_INACTIVE' OR m.month <= DATE '2025-06-01')
  CROSS JOIN LATERAL generate_series(1, CASE u.generator_profile
    WHEN 'D_EXPLORER' THEN 6 WHEN 'C_MIXED' THEN 5
    WHEN 'A_FREQUENT_BUYER' THEN 4 WHEN 'B_RECURRING_RENTER' THEN 4
    WHEN 'E_OCCASIONAL' THEN 2 ELSE 1 END) weight(rep)
)
SELECT month, user_id, generator_profile,
       row_number() OVER (PARTITION BY month ORDER BY user_id, rep) AS slot_no,
       count(*) OVER (PARTITION BY month) AS slot_count
FROM expanded;

CREATE INDEX ON _v2_sale_slots (month, slot_no);
CREATE INDEX ON _v2_rental_slots (month, slot_no);
CREATE INDEX ON _v2_interaction_slots (month, slot_no);

CREATE TEMP TABLE _v2_sale_parts ON COMMIT DROP AS
WITH raw_parts AS (
  SELECT
    m.*,
    part_no,
    format('demo-v2-sale-%s-%s-%s', m.product_id, to_char(m.month, 'YYYYMM'), lpad(part_no::text, 2, '0')) AS order_id,
    least(chunk.max_quantity, m.units_sold - (part_no - 1) * chunk.max_quantity)::integer AS part_quantity
  FROM _v2_monthly m
  CROSS JOIN LATERAL (
    SELECT CASE WHEN m.unit_price > 8000 THEN 1 WHEN m.unit_price > 3000 THEN 3 ELSE 6 END AS max_quantity
  ) chunk
  CROSS JOIN LATERAL generate_series(1, ceil(m.units_sold::numeric / chunk.max_quantity)::integer) part_no
  WHERE m.units_sold > 0
), counts AS (
  SELECT month, max(slot_count) AS slot_count FROM _v2_sale_slots GROUP BY month
)
SELECT
  r.*,
  s.user_id,
  s.generator_profile,
  (r.month + (7 + mod(abs(hashtextextended(r.order_id, 113)::numeric), 18))::integer)::timestamp AS order_date
FROM raw_parts r
JOIN counts c USING (month)
JOIN _v2_sale_slots s
  ON s.month = r.month
 AND s.slot_no = 1 + mod(abs(hashtextextended(r.order_id, 127)::numeric), c.slot_count)::bigint;

INSERT INTO management.sales_orders (
  id, "userId", status, subtotal, discount, total, "orderDate", "createdAt", "updatedAt", "batchName"
)
SELECT
  order_id,
  user_id,
  'COMPLETED',
  round((part_quantity * unit_price)::numeric, 2)::double precision,
  CASE WHEN active_promotion THEN round((part_quantity * unit_price * 0.10)::numeric, 2)::double precision ELSE 0 END,
  round((part_quantity * unit_price * CASE WHEN active_promotion THEN 0.90 ELSE 1 END)::numeric, 2)::double precision,
  order_date,
  order_date,
  order_date,
  'CEMYDI_DEMO_VARIANCE_V2'
FROM _v2_sale_parts;

INSERT INTO management.sales_order_items (
  "salesOrderId", "productId", quantity, "unitPrice", subtotal, "createdAt"
)
SELECT
  order_id, product_id, part_quantity, unit_price,
  round((part_quantity * unit_price)::numeric, 2)::double precision,
  order_date
FROM _v2_sale_parts;

-- Cancelaciones adicionales: aportan variedad operativa y no cuentan como demanda.
INSERT INTO management.sales_orders (
  id, "userId", status, subtotal, discount, total, "orderDate", "createdAt", "updatedAt", "batchName"
)
SELECT
  replace(order_id, 'demo-v2-sale-', 'demo-v2-sale-c-'), user_id, 'CANCELLED',
  unit_price, 0, unit_price, order_date, order_date, order_date,
  'CEMYDI_DEMO_VARIANCE_V2'
FROM _v2_sale_parts
WHERE mod(abs(hashtextextended(order_id, 131)::numeric), 17) = 0;

INSERT INTO management.sales_order_items (
  "salesOrderId", "productId", quantity, "unitPrice", subtotal, "createdAt"
)
SELECT
  replace(order_id, 'demo-v2-sale-', 'demo-v2-sale-c-'), product_id, 1, unit_price, unit_price, order_date
FROM _v2_sale_parts
WHERE mod(abs(hashtextextended(order_id, 131)::numeric), 17) = 0;

CREATE TEMP TABLE _v2_rental_parts ON COMMIT DROP AS
WITH raw_parts AS (
  SELECT
    m.*,
    part_no,
    format('demo-v2-rental-%s-%s-%s', m.product_id, to_char(m.month, 'YYYYMM'), lpad(part_no::text, 2, '0')) AS rental_id,
    least(chunk.max_quantity, m.units_rented - (part_no - 1) * chunk.max_quantity)::integer AS part_quantity
  FROM _v2_monthly m
  CROSS JOIN LATERAL (
    SELECT CASE WHEN m.unit_price > 8000 THEN 1 WHEN m.unit_price > 3000 THEN 2 ELSE 3 END AS max_quantity
  ) chunk
  CROSS JOIN LATERAL generate_series(1, ceil(m.units_rented::numeric / chunk.max_quantity)::integer) part_no
  WHERE m.units_rented > 0
), counts AS (
  SELECT month, max(slot_count) AS slot_count FROM _v2_rental_slots GROUP BY month
), assigned AS (
  SELECT
    r.*,
    s.user_id,
    s.generator_profile,
    (r.month + (3 + mod(abs(hashtextextended(r.rental_id, 137)::numeric), 7))::integer)::timestamp AS start_date,
    (3 + mod(
      abs(hashtextextended(r.rental_id, 139)::numeric),
      CASE WHEN r.unit_price > 8000 THEN 7 WHEN r.unit_price > 3000 THEN 12 ELSE 19 END
    ))::integer AS rental_days
  FROM raw_parts r
  JOIN counts c USING (month)
  JOIN _v2_rental_slots s
    ON s.month = r.month
   AND s.slot_no = 1 + mod(abs(hashtextextended(r.rental_id, 149)::numeric), c.slot_count)::bigint
)
SELECT
  a.*,
  (a.start_date + (a.rental_days - 1) * INTERVAL '1 day')::timestamp AS end_date,
  CASE mod(abs(hashtextextended(a.rental_id, 151)::numeric), 10)::integer
    WHEN 0 THEN 'APPROVED' WHEN 1 THEN 'APPROVED'
    WHEN 2 THEN 'DELIVERED' WHEN 3 THEN 'DELIVERED' WHEN 4 THEN 'DELIVERED'
    ELSE 'RETURNED'
  END AS rental_status,
  round((a.part_quantity * a.rental_days * a.rental_daily_price)::numeric, 2)::double precision AS line_subtotal,
  round((a.part_quantity * greatest(100, a.unit_price * 0.12))::numeric, 2)::double precision AS line_deposit
FROM assigned a;

CREATE TEMP TABLE _v2_context ON COMMIT DROP AS
SELECT (SELECT id FROM accounts.users WHERE rol = 'ADMIN'::public."Rol" ORDER BY id LIMIT 1) AS admin_id;

INSERT INTO management.rental_requests (
  id, folio, "userId", status, subtotal, "depositTotal", total,
  "depositStatus", "depositReturnedAmount", "depositRetainedAmount",
  notes, "applicantName", "applicantEmail", "applicantPhone",
  "isForAnotherPerson", "deliveryMethod", "preferredSchedule",
  "rentalTermsAcceptedAt", "privacyAcceptedAt", "approvedById", "approvedAt",
  "deliveredAt", "returnedAt", "statusUpdatedById", "statusUpdatedAt",
  "createdAt", "updatedAt"
)
SELECT
  r.rental_id,
  'V2-' || upper(substr(md5(r.rental_id), 1, 10)),
  r.user_id,
  r.rental_status::public."RentalRequestStatus",
  r.line_subtotal,
  r.line_deposit,
  r.line_subtotal + r.line_deposit,
  CASE WHEN r.rental_status = 'RETURNED' THEN 'RETURNED'::public."RentalDepositStatus"
       ELSE 'PENDING'::public."RentalDepositStatus" END,
  CASE WHEN r.rental_status = 'RETURNED' THEN r.line_deposit ELSE 0 END,
  0,
  '[CEMYDI_DEMO_VARIANCE_V2] Solicitud ficticia coherente.',
  u.nombre,
  u.correo,
  u.telefono,
  false,
  CASE WHEN mod(abs(hashtextextended(r.rental_id, 157)::numeric), 3) = 0
       THEN 'HOME_DELIVERY'::public."RentalDeliveryMethod"
       ELSE 'PICKUP'::public."RentalDeliveryMethod" END,
  CASE WHEN mod(abs(hashtextextended(r.rental_id, 163)::numeric), 2) = 0 THEN '09:00-13:00' ELSE '14:00-18:00' END,
  r.start_date - INTERVAL '1 day',
  r.start_date - INTERVAL '1 day',
  c.admin_id,
  r.start_date - INTERVAL '1 day',
  CASE WHEN r.rental_status IN ('DELIVERED','RETURNED') THEN r.start_date ELSE NULL END,
  CASE WHEN r.rental_status = 'RETURNED' THEN r.end_date ELSE NULL END,
  c.admin_id,
  CASE WHEN r.rental_status = 'RETURNED' THEN r.end_date ELSE r.start_date END,
  r.start_date - INTERVAL '1 day',
  CASE WHEN r.rental_status = 'RETURNED' THEN r.end_date ELSE r.start_date END
FROM _v2_rental_parts r
JOIN accounts.users u ON u.id = r.user_id
CROSS JOIN _v2_context c;

INSERT INTO management.rental_request_items (
  "rentalRequestId", "productId", quantity, "startDate", "endDate", days,
  "dailyPrice", deposit, "lineSubtotal", "lineDeposit", "lineTotal", notes,
  "productNameSnapshot", "productBrandSnapshot", "productModelSnapshot",
  "productSkuSnapshot", "productImageSnapshot", "productClassSnapshot",
  "prescriptionRequiredSnapshot", "createdAt"
)
SELECT
  r.rental_id, r.product_id, r.part_quantity, r.start_date, r.end_date, r.rental_days,
  r.rental_daily_price,
  greatest(100, r.unit_price * 0.12),
  r.line_subtotal, r.line_deposit, r.line_subtotal + r.line_deposit,
  '[CEMYDI_DEMO_VARIANCE_V2] Detalle de renta ficticio.',
  p.nombre, p.marca, p.modelo, p.slug, img."imageUrl", p.clasificacion, p."requiereReceta",
  r.start_date - INTERVAL '1 day'
FROM _v2_rental_parts r
JOIN catalog.products p ON p.id = r.product_id
LEFT JOIN LATERAL (
  SELECT pi."imageUrl" FROM catalog.product_images pi
  WHERE pi."productId" = p.id ORDER BY pi."sortOrder", pi.id LIMIT 1
) img ON true;

-- Solicitudes rechazadas/canceladas; no generan detalle ni demanda.
INSERT INTO management.rental_requests (
  id, folio, "userId", status, subtotal, "depositTotal", total, notes,
  "rejectedReason", "cancelledAt", "rejectedAt", "statusUpdatedAt", "createdAt", "updatedAt"
)
SELECT
  replace(rental_id, 'demo-v2-rental-', 'demo-v2-rental-x-'),
  'V2X-' || upper(substr(md5(rental_id), 1, 9)),
  user_id,
  CASE WHEN mod(abs(hashtextextended(rental_id, 167)::numeric), 2) = 0
       THEN 'CANCELLED'::public."RentalRequestStatus"
       ELSE 'REJECTED'::public."RentalRequestStatus" END,
  0, 0, 0,
  '[CEMYDI_DEMO_VARIANCE_V2] Solicitud no valida para contraste.',
  CASE WHEN mod(abs(hashtextextended(rental_id, 167)::numeric), 2) = 1 THEN 'Documentacion ficticia incompleta' ELSE NULL END,
  CASE WHEN mod(abs(hashtextextended(rental_id, 167)::numeric), 2) = 0 THEN start_date ELSE NULL END,
  CASE WHEN mod(abs(hashtextextended(rental_id, 167)::numeric), 2) = 1 THEN start_date ELSE NULL END,
  start_date, start_date - INTERVAL '1 day', start_date
FROM _v2_rental_parts
WHERE mod(abs(hashtextextended(rental_id, 173)::numeric), 19) = 0;

-- Interacciones de exploracion. Cada fila es un evento individual.
WITH event_counts AS (
  SELECT product_id, month, demand_pattern, 'VIEW'::text interaction_type, views AS event_count FROM _v2_monthly
  UNION ALL SELECT product_id, month, demand_pattern, 'SEARCH', searches FROM _v2_monthly
  UNION ALL SELECT product_id, month, demand_pattern, 'ADD_TO_CART', add_to_cart FROM _v2_monthly
  UNION ALL SELECT product_id, month, demand_pattern, 'FAVORITE', favorites FROM _v2_monthly
  UNION ALL SELECT product_id, month, demand_pattern, 'SHARE', shares FROM _v2_monthly
), expanded AS (
  SELECT
    e.*,
    event_no,
    format('%s-%s-%s-%s', e.product_id, to_char(e.month, 'YYYYMM'), e.interaction_type, event_no) AS event_key
  FROM event_counts e
  CROSS JOIN LATERAL generate_series(1, e.event_count) event_no
  WHERE e.event_count > 0
), counts AS (
  SELECT month, max(slot_count) AS slot_count FROM _v2_interaction_slots GROUP BY month
)
INSERT INTO analytics.customer_product_interactions (
  "userId", "productId", "interactionType", quantity, source, "sessionId",
  metadata, "occurredAt", "batchName", "createdAt"
)
SELECT
  slots.user_id,
  e.product_id,
  e.interaction_type,
  1,
  CASE mod(abs(hashtextextended(e.event_key, 179)::numeric), 12)::integer
    WHEN 0 THEN 'ALEXA' WHEN 1 THEN 'ADMIN' ELSE 'WEB' END,
  'demo-v2-session-' || substr(md5(e.event_key || slots.user_id::text), 1, 20),
  jsonb_build_object(
    'batch', 'CEMYDI_DEMO_VARIANCE_V2',
    'demandPattern', e.demand_pattern,
    'generatorProfile', slots.generator_profile
  ),
  (e.month + (1 + mod(abs(hashtextextended(e.event_key, 181)::numeric), 27))::integer
    + make_interval(hours => mod(abs(hashtextextended(e.event_key, 191)::numeric), 12)::integer + 8))::timestamp,
  'CEMYDI_DEMO_VARIANCE_V2',
  (e.month + (1 + mod(abs(hashtextextended(e.event_key, 181)::numeric), 27))::integer
    + make_interval(hours => mod(abs(hashtextextended(e.event_key, 191)::numeric), 12)::integer + 8))::timestamp
FROM expanded e
JOIN counts c USING (month)
JOIN _v2_interaction_slots slots
  ON slots.month = e.month
 AND slots.slot_no = 1 + mod(abs(hashtextextended(e.event_key, 193)::numeric), c.slot_count)::bigint;

-- PURCHASE y RENT corresponden solo a productos aptos y a operaciones validas.
INSERT INTO analytics.customer_product_interactions (
  "userId", "productId", "interactionType", quantity, source, "sessionId",
  metadata, "occurredAt", "batchName", "createdAt"
)
SELECT
  s.user_id, s.product_id, 'PURCHASE', s.part_quantity, 'WEB',
  'demo-v2-session-sale-' || substr(md5(s.order_id), 1, 16),
  jsonb_build_object('batch','CEMYDI_DEMO_VARIANCE_V2','salesOrderId',s.order_id,'generatorProfile',s.generator_profile),
  s.order_date, 'CEMYDI_DEMO_VARIANCE_V2', s.order_date
FROM _v2_sale_parts s
JOIN catalog.products p ON p.id = s.product_id
WHERE p."tipoAdquisicion" IN ('VENTA'::public."TipoAdquisicion", 'MIXTO'::public."TipoAdquisicion");

INSERT INTO analytics.customer_product_interactions (
  "userId", "productId", "interactionType", quantity, source, "sessionId",
  metadata, "occurredAt", "batchName", "createdAt"
)
SELECT
  r.user_id, r.product_id, 'RENT', r.part_quantity, 'WEB',
  'demo-v2-session-rent-' || substr(md5(r.rental_id), 1, 16),
  jsonb_build_object('batch','CEMYDI_DEMO_VARIANCE_V2','rentalRequestId',r.rental_id,'generatorProfile',r.generator_profile),
  r.start_date, 'CEMYDI_DEMO_VARIANCE_V2', r.start_date
FROM _v2_rental_parts r
JOIN catalog.products p ON p.id = r.product_id
WHERE p."tipoAdquisicion" IN ('RENTA'::public."TipoAdquisicion", 'MIXTO'::public."TipoAdquisicion");

-- Resenas unicas creadas unicamente por compradores V2 de ese producto.
WITH purchased AS (
  SELECT
    s.user_id,
    s.product_id,
    min(s.order_date) AS first_purchase,
    row_number() OVER (PARTITION BY s.user_id ORDER BY hashtextextended(s.product_id::text, s.user_id)) AS rn
  FROM _v2_sale_parts s
  GROUP BY s.user_id, s.product_id
), selected AS (
  SELECT * FROM purchased
  WHERE rn <= 2
    AND mod(abs(hashtextextended(user_id::text || product_id::text, 197)::numeric), 3) <> 0
)
INSERT INTO management.reviews (
  "productId", "userId", rating, comment, status, "showOnHome",
  "approvedById", "approvedAt", "createdAt", "updatedAt"
)
SELECT
  s.product_id,
  s.user_id,
  (3 + mod(abs(hashtextextended(s.user_id::text || s.product_id::text, 199)::numeric), 3))::integer,
  '[CEMYDI_DEMO_VARIANCE_V2] ' || (ARRAY[
    'El producto cumplio con el uso esperado y la informacion fue clara.',
    'Buena relacion entre calidad, precio y facilidad de uso.',
    'La entrega demo fue adecuada; el equipo se sintio estable.',
    'Producto practico para el cuidado diario y con acabado consistente.',
    'La opcion resulto util; conviene revisar siempre la talla o medida.'
  ])[1 + mod(abs(hashtextextended(s.user_id::text || s.product_id::text, 211)::numeric), 5)::integer],
  'APPROVED'::public."ReviewStatus",
  mod(abs(hashtextextended(s.user_id::text || s.product_id::text, 223)::numeric), 11) = 0,
  c.admin_id,
  least(TIMESTAMP '2026-06-30 18:00:00', s.first_purchase + INTERVAL '12 days'),
  least(TIMESTAMP '2026-06-30 17:00:00', s.first_purchase + INTERVAL '10 days'),
  least(TIMESTAMP '2026-06-30 18:00:00', s.first_purchase + INTERVAL '12 days')
FROM selected s
CROSS JOIN _v2_context c
ON CONFLICT ("userId", "productId") DO NOTHING;

-- Las vistas mantienen sus columnas existentes y agregan solo variables nuevas al final.
CREATE OR REPLACE VIEW analytics.v_dataset_product_recommendation AS
SELECT
  p.id AS product_id,
  p.nombre AS product_name,
  p.marca AS brand,
  p.modelo AS model,
  p.clasificacion AS classification,
  p."tipoAdquisicion"::text AS acquisition_type,
  p.precio AS sale_price,
  COALESCE(p."rentalDailyPrice", 0::double precision) AS rental_daily_price,
  p.stock,
  p."requiereReceta" AS requires_prescription,
  COALESCE(p.material, '') AS material,
  COALESCE(p.medidas, '') AS measures,
  COALESCE(p."pesoSoportado", '') AS supported_weight,
  COALESCE(p.descripcion, '') AS description,
  COALESCE(p."indicacionesUso", '') AS use_indications,
  COALESCE(pi."imageUrl", '') AS image_url,
  count(i.id) FILTER (WHERE i."interactionType" = 'VIEW') AS view_count,
  count(i.id) FILTER (WHERE i."interactionType" = 'FAVORITE') AS favorite_count,
  count(i.id) FILTER (WHERE i."interactionType" = 'PURCHASE') AS purchase_interaction_count,
  count(i.id) FILTER (WHERE i."interactionType" = 'RENT') AS rental_interaction_count,
  count(i.id) FILTER (WHERE i."interactionType" = 'SEARCH') AS search_count,
  count(i.id) FILTER (WHERE i."interactionType" = 'ADD_TO_CART') AS add_to_cart_count
FROM catalog.products p
LEFT JOIN LATERAL (
  SELECT product_images."imageUrl"
  FROM catalog.product_images
  WHERE product_images."productId" = p.id
  ORDER BY product_images."sortOrder", product_images.id
  LIMIT 1
) pi ON true
LEFT JOIN analytics.customer_product_interactions i
  ON i."productId" = p.id AND i."batchName" = 'CEMYDI_DEMO_VARIANCE_V2'
WHERE p.activo = true
GROUP BY p.id, p.nombre, p.marca, p.modelo, p.clasificacion, p."tipoAdquisicion",
         p.precio, p."rentalDailyPrice", p.stock, p."requiereReceta", p.material,
         p.medidas, p."pesoSoportado", p.descripcion, p."indicacionesUso", pi."imageUrl";

CREATE OR REPLACE VIEW analytics.v_dataset_customer_clustering AS
WITH interaction_summary AS (
  SELECT
    i."userId",
    count(*) FILTER (WHERE i."interactionType" = 'VIEW') AS views,
    count(*) FILTER (WHERE i."interactionType" = 'SEARCH') AS searches,
    count(*) FILTER (WHERE i."interactionType" = 'ADD_TO_CART') AS add_to_cart,
    count(*) FILTER (WHERE i."interactionType" = 'FAVORITE') AS favorites,
    count(*) FILTER (WHERE i."interactionType" = 'SHARE') AS shares,
    count(DISTINCT i."productId") AS distinct_products_interacted,
    min(i."occurredAt") AS first_interaction,
    max(i."occurredAt") AS last_interaction,
    count(*) AS total_interactions
  FROM analytics.customer_product_interactions i
  WHERE i."batchName" = 'CEMYDI_DEMO_VARIANCE_V2'
  GROUP BY i."userId"
), sales_summary AS (
  SELECT so."userId",
         count(*) FILTER (WHERE so.status = 'COMPLETED') AS completed_sales,
         COALESCE(sum(so.total) FILTER (WHERE so.status = 'COMPLETED'), 0) AS amount_spent_sales
  FROM management.sales_orders so
  WHERE so."batchName" = 'CEMYDI_DEMO_VARIANCE_V2'
  GROUP BY so."userId"
), sales_units AS (
  SELECT so."userId",
         COALESCE(sum(soi.quantity) FILTER (WHERE so.status = 'COMPLETED'), 0) AS units_purchased
  FROM management.sales_orders so
  LEFT JOIN management.sales_order_items soi ON soi."salesOrderId" = so.id
  WHERE so."batchName" = 'CEMYDI_DEMO_VARIANCE_V2'
  GROUP BY so."userId"
), rental_summary AS (
  SELECT rr."userId",
         count(*) FILTER (WHERE rr.status IN ('APPROVED','DELIVERED','RETURNED')) AS valid_rentals,
         COALESCE(sum(rr.subtotal) FILTER (WHERE rr.status IN ('APPROVED','DELIVERED','RETURNED')), 0) AS amount_spent_rentals
  FROM management.rental_requests rr
  WHERE rr.id LIKE 'demo-v2-rental-%' AND rr.id NOT LIKE 'demo-v2-rental-x-%'
  GROUP BY rr."userId"
), rental_units AS (
  SELECT rr."userId",
         COALESCE(sum(rri.quantity) FILTER (WHERE rr.status IN ('APPROVED','DELIVERED','RETURNED')), 0) AS units_rented,
         COALESCE(avg(rri.days) FILTER (WHERE rr.status IN ('APPROVED','DELIVERED','RETURNED')), 0) AS average_rental_days
  FROM management.rental_requests rr
  LEFT JOIN management.rental_request_items rri ON rri."rentalRequestId" = rr.id
  WHERE rr.id LIKE 'demo-v2-rental-%' AND rr.id NOT LIKE 'demo-v2-rental-x-%'
  GROUP BY rr."userId"
)
SELECT
  u.id AS customer_id,
  u.nombre AS customer_name,
  u.correo AS email,
  COALESCE(i.views, 0)::integer AS views,
  COALESCE(i.searches, 0)::integer AS searches,
  COALESCE(i.add_to_cart, 0)::integer AS add_to_cart,
  COALESCE(i.favorites, 0)::integer AS favorites,
  COALESCE(i.shares, 0)::integer AS shares,
  COALESCE(i.distinct_products_interacted, 0)::integer AS distinct_products_interacted,
  COALESCE(i.total_interactions, 0)::integer AS total_interactions,
  COALESCE(s.completed_sales, 0)::integer AS completed_sales,
  COALESCE(su.units_purchased, 0)::integer AS units_purchased,
  round(COALESCE(s.amount_spent_sales, 0)::numeric, 2)::double precision AS amount_spent_sales,
  COALESCE(r.valid_rentals, 0)::integer AS valid_rentals,
  COALESCE(ru.units_rented, 0)::integer AS units_rented,
  round(COALESCE(r.amount_spent_rentals, 0)::numeric, 2)::double precision AS amount_spent_rentals,
  round(COALESCE(ru.average_rental_days, 0)::numeric, 2)::double precision AS average_rental_days,
  CASE WHEN i.last_interaction IS NULL THEN 365
       ELSE least(365, greatest(0, DATE '2026-07-01' - i.last_interaction::date)) END AS days_since_last_activity,
  round(COALESCE(i.total_interactions, 0)::numeric / 36.0, 2)::double precision AS average_monthly_activity
FROM accounts.users u
LEFT JOIN interaction_summary i ON i."userId" = u.id
LEFT JOIN sales_summary s ON s."userId" = u.id
LEFT JOIN sales_units su ON su."userId" = u.id
LEFT JOIN rental_summary r ON r."userId" = u.id
LEFT JOIN rental_units ru ON ru."userId" = u.id
WHERE u.correo LIKE 'demo.usuario%@cemydi.local'
   OR u.correo LIKE 'demo.v2.usuario%@cemydi.local';

CREATE OR REPLACE VIEW analytics.v_dataset_monthly_demand AS
WITH sales_by_month AS (
  SELECT soi."productId", date_trunc('month', so."orderDate")::date AS month,
         sum(soi.quantity) FILTER (WHERE so.status = 'COMPLETED') AS units_sold,
         count(DISTINCT so.id) FILTER (WHERE so.status = 'COMPLETED') AS completed_sale_orders
  FROM management.sales_orders so
  JOIN management.sales_order_items soi ON soi."salesOrderId" = so.id
  WHERE so."batchName" = 'CEMYDI_DEMO_VARIANCE_V2'
  GROUP BY soi."productId", date_trunc('month', so."orderDate")::date
), rentals_by_month AS (
  SELECT rri."productId", date_trunc('month', rri."startDate")::date AS month,
         sum(rri.quantity) FILTER (WHERE rr.status IN ('APPROVED','DELIVERED','RETURNED')) AS units_rented,
         count(DISTINCT rr.id) FILTER (WHERE rr.status IN ('APPROVED','DELIVERED','RETURNED')) AS valid_rental_requests,
         avg(rri.days) FILTER (WHERE rr.status IN ('APPROVED','DELIVERED','RETURNED')) AS average_rental_days
  FROM management.rental_requests rr
  JOIN management.rental_request_items rri ON rri."rentalRequestId" = rr.id
  WHERE rr.id LIKE 'demo-v2-rental-%' AND rr.id NOT LIKE 'demo-v2-rental-x-%'
  GROUP BY rri."productId", date_trunc('month', rri."startDate")::date
), interactions_by_month AS (
  SELECT i."productId", date_trunc('month', i."occurredAt")::date AS month,
         count(*) FILTER (WHERE i."interactionType" = 'VIEW') AS views,
         count(*) FILTER (WHERE i."interactionType" = 'SEARCH') AS searches,
         count(*) FILTER (WHERE i."interactionType" = 'ADD_TO_CART') AS add_to_cart,
         count(*) FILTER (WHERE i."interactionType" = 'FAVORITE') AS favorites,
         count(*) FILTER (WHERE i."interactionType" = 'SHARE') AS shares
  FROM analytics.customer_product_interactions i
  WHERE i."batchName" = 'CEMYDI_DEMO_VARIANCE_V2'
  GROUP BY i."productId", date_trunc('month', i."occurredAt")::date
), base AS (
  SELECT
    s."productId" AS product_id,
    p.nombre AS product_name,
    p.clasificacion AS classification,
    p."tipoAdquisicion"::text AS acquisition_type,
    s.month,
    EXTRACT(year FROM s.month)::integer AS year,
    EXTRACT(month FROM s.month)::integer AS month_number,
    COALESCE(sa.units_sold, 0)::integer AS units_sold,
    COALESCE(r.units_rented, 0)::integer AS units_rented,
    (COALESCE(sa.units_sold, 0) + COALESCE(r.units_rented, 0))::integer AS monthly_demand,
    COALESCE(sa.completed_sale_orders, 0)::integer AS completed_sale_orders,
    COALESCE(r.valid_rental_requests, 0)::integer AS valid_rental_requests,
    round(COALESCE(r.average_rental_days, 0)::numeric, 2)::double precision AS average_rental_days,
    COALESCE(i.views, 0)::integer AS views,
    COALESCE(i.searches, 0)::integer AS searches,
    COALESCE(i.add_to_cart, 0)::integer AS add_to_cart,
    COALESCE(i.favorites, 0)::integer AS favorites,
    COALESCE(i.shares, 0)::integer AS shares,
    s."unitPrice" AS unit_price,
    COALESCE(s."rentalDailyPrice", 0) AS rental_daily_price,
    s."stockAvailable" AS stock_available,
    s."stockReserved" AS stock_reserved,
    s."minimumStock" AS minimum_stock,
    s."activePromotion" AS active_promotion,
    p."requiereReceta" AS requires_prescription
  FROM analytics.inventory_monthly_snapshots s
  JOIN catalog.products p ON p.id = s."productId"
  LEFT JOIN sales_by_month sa ON sa."productId" = s."productId" AND sa.month = s.month
  LEFT JOIN rentals_by_month r ON r."productId" = s."productId" AND r.month = s.month
  LEFT JOIN interactions_by_month i ON i."productId" = s."productId" AND i.month = s.month
  WHERE s."batchName" = 'CEMYDI_DEMO_VARIANCE_V2'
)
SELECT
  base.*,
  COALESCE(lag(units_sold) OVER (PARTITION BY product_id ORDER BY month), 0)::integer AS previous_month_sales,
  COALESCE(lag(units_rented) OVER (PARTITION BY product_id ORDER BY month), 0)::integer AS previous_month_rentals,
  COALESCE(lag(views) OVER (PARTITION BY product_id ORDER BY month), 0)::integer AS previous_month_views
FROM base;

-- Reportes solicitados: conteos y estadisticas de variacion.
SELECT 'usuarios_v2' AS metric, count(*)::bigint AS value
FROM accounts.users WHERE correo LIKE 'demo.v2.usuario%@cemydi.local'
UNION ALL SELECT 'productos_v2', count(*) FROM catalog.products WHERE slug LIKE 'demo-variance-%'
UNION ALL SELECT 'imagenes_v2', count(*) FROM catalog.product_images pi JOIN catalog.products p ON p.id=pi."productId" WHERE p.slug LIKE 'demo-variance-%'
UNION ALL SELECT 'ventas_v2', count(*) FROM management.sales_orders WHERE "batchName"='CEMYDI_DEMO_VARIANCE_V2'
UNION ALL SELECT 'rentas_v2', count(*) FROM management.rental_requests WHERE id LIKE 'demo-v2-rental-%'
UNION ALL SELECT 'interacciones_v2', count(*) FROM analytics.customer_product_interactions WHERE "batchName"='CEMYDI_DEMO_VARIANCE_V2'
UNION ALL SELECT 'promociones_v2', count(*) FROM management.promotions WHERE descripcion LIKE '[CEMYDI_DEMO_VARIANCE_V2]%'
UNION ALL SELECT 'resenas_v2', count(*) FROM management.reviews WHERE comment LIKE '[CEMYDI_DEMO_VARIANCE_V2]%'
UNION ALL SELECT 'snapshots_v2', count(*) FROM analytics.inventory_monthly_snapshots WHERE "batchName"='CEMYDI_DEMO_VARIANCE_V2'
UNION ALL SELECT 'dataset_recomendacion', count(*) FROM analytics.v_dataset_product_recommendation
UNION ALL SELECT 'dataset_clustering', count(*) FROM analytics.v_dataset_customer_clustering
UNION ALL SELECT 'dataset_regresion', count(*) FROM analytics.v_dataset_monthly_demand
ORDER BY metric;

SELECT
  min(views) AS min_views, max(views) AS max_views, round(avg(views),2) AS avg_views, round(stddev_samp(views),2) AS sd_views,
  min(searches) AS min_searches, max(searches) AS max_searches, round(avg(searches),2) AS avg_searches, round(stddev_samp(searches),2) AS sd_searches,
  min(completed_sales) AS min_sales, max(completed_sales) AS max_sales, round(avg(completed_sales),2) AS avg_sales, round(stddev_samp(completed_sales),2) AS sd_sales,
  min(valid_rentals) AS min_rentals, max(valid_rentals) AS max_rentals, round(avg(valid_rentals),2) AS avg_rentals, round(stddev_samp(valid_rentals),2) AS sd_rentals,
  round(min(amount_spent_sales + amount_spent_rentals)::numeric,2) AS min_amount,
  round(max(amount_spent_sales + amount_spent_rentals)::numeric,2) AS max_amount,
  round(avg(amount_spent_sales + amount_spent_rentals)::numeric,2) AS avg_amount,
  round(stddev_samp(amount_spent_sales + amount_spent_rentals)::numeric,2) AS sd_amount,
  min(total_interactions) AS min_interactions, max(total_interactions) AS max_interactions,
  round(avg(total_interactions),2) AS avg_interactions, round(stddev_samp(total_interactions),2) AS sd_interactions,
  min(days_since_last_activity) AS min_days, max(days_since_last_activity) AS max_days,
  round(avg(days_since_last_activity),2) AS avg_days, round(stddev_samp(days_since_last_activity),2) AS sd_days
FROM analytics.v_dataset_customer_clustering;

SELECT
  min(monthly_demand) AS min_demand,
  max(monthly_demand) AS max_demand,
  round(avg(monthly_demand)::numeric,2) AS avg_demand,
  round(stddev_samp(monthly_demand)::numeric,2) AS sd_demand,
  count(*) FILTER (WHERE monthly_demand=0) AS zero_demand_months,
  count(*) FILTER (WHERE active_promotion) AS promotion_months,
  count(DISTINCT product_id) AS products,
  count(DISTINCT month) AS months,
  min(month) AS first_month,
  max(month) AS last_month
FROM analytics.v_dataset_monthly_demand;

SELECT demand_pattern, count(*) AS products
FROM _v2_products GROUP BY demand_pattern ORDER BY demand_pattern;

SELECT acquisition_type, count(*) AS products
FROM analytics.v_dataset_product_recommendation GROUP BY acquisition_type ORDER BY acquisition_type;

SELECT classification, count(*) AS products
FROM analytics.v_dataset_product_recommendation GROUP BY classification ORDER BY products DESC, classification;

SELECT
  min(sale_price) AS min_price, max(sale_price) AS max_price,
  round(avg(sale_price)::numeric,2) AS avg_price,
  round(stddev_samp(sale_price)::numeric,2) AS sd_price,
  min(stock) AS min_stock, max(stock) AS max_stock,
  count(*) FILTER (WHERE requires_prescription) AS with_prescription,
  count(*) FILTER (WHERE NOT requires_prescription) AS without_prescription
FROM analytics.v_dataset_product_recommendation;

DO $assertions$
DECLARE
  recommendation_rows integer;
  clustering_rows integer;
  regression_rows integer;
  regression_products integer;
  regression_months integer;
  clustering_sd double precision;
  demand_sd double precision;
  demand_zeros integer;
  promotion_months integer;
BEGIN
  SELECT count(*) INTO recommendation_rows FROM analytics.v_dataset_product_recommendation;
  SELECT count(*), stddev_samp(total_interactions)
    INTO clustering_rows, clustering_sd FROM analytics.v_dataset_customer_clustering;
  SELECT count(*), count(DISTINCT product_id), count(DISTINCT month),
         stddev_samp(monthly_demand), count(*) FILTER (WHERE monthly_demand=0),
         count(*) FILTER (WHERE active_promotion)
    INTO regression_rows, regression_products, regression_months, demand_sd, demand_zeros, promotion_months
  FROM analytics.v_dataset_monthly_demand;

  IF recommendation_rows NOT BETWEEN 120 AND 180 THEN
    RAISE EXCEPTION 'Dataset de recomendacion fuera de rango: % filas', recommendation_rows;
  END IF;
  IF clustering_rows < 1000 OR clustering_sd IS NULL OR clustering_sd < 5 THEN
    RAISE EXCEPTION 'Dataset de clustering insuficiente: filas=%, sd_interacciones=%', clustering_rows, clustering_sd;
  END IF;
  IF regression_rows < 4320 OR regression_products < 120 OR regression_months <> 36 THEN
    RAISE EXCEPTION 'Dataset de regresion insuficiente: filas=%, productos=%, meses=%', regression_rows, regression_products, regression_months;
  END IF;
  IF demand_sd IS NULL OR demand_sd < 3 OR demand_zeros = 0 OR promotion_months = 0 THEN
    RAISE EXCEPTION 'Varianza temporal insuficiente: sd=%, ceros=%, meses_promocion=%', demand_sd, demand_zeros, promotion_months;
  END IF;
  IF EXISTS (
    SELECT 1 FROM catalog.products p
    WHERE p.slug LIKE 'demo-variance-%'
      AND NOT EXISTS (
        SELECT 1 FROM catalog.product_images pi
        WHERE pi."productId"=p.id AND pi."sortOrder"=0 AND pi."imageUrl" LIKE 'https://%'
      )
  ) THEN
    RAISE EXCEPTION 'Hay productos V2 sin imagen principal HTTPS';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM management.sales_orders so
    JOIN accounts.users u ON u.id=so."userId"
    WHERE so."batchName"='CEMYDI_DEMO_VARIANCE_V2' AND so."orderDate" < u."createdAt"
  ) THEN
    RAISE EXCEPTION 'Hay ventas V2 anteriores al registro del usuario';
  END IF;
  IF EXISTS (
    SELECT 1 FROM management.rental_request_items rri
    WHERE rri."rentalRequestId" LIKE 'demo-v2-rental-%' AND rri."endDate" < rri."startDate"
  ) THEN
    RAISE EXCEPTION 'Hay rentas V2 con fecha final anterior a la inicial';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM management.rental_requests rr
    JOIN accounts.users u ON u.id=rr."userId"
    WHERE rr.id LIKE 'demo-v2-rental-%' AND rr."createdAt" < u."createdAt"
  ) THEN
    RAISE EXCEPTION 'Hay rentas V2 anteriores al registro del usuario';
  END IF;
  IF EXISTS (
    SELECT 1 FROM management.promotions
    WHERE descripcion LIKE '[CEMYDI_DEMO_VARIANCE_V2]%' AND "endAt" <= "startAt"
  ) THEN
    RAISE EXCEPTION 'Hay promociones V2 con rango invalido';
  END IF;
END
$assertions$;

COMMIT;
