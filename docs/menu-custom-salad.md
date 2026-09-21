# Ensalada configurable en los menús

En administración, cada fecha nueva comienza con **ENSALADA A TU MANERA** como
primer plato 1. Solo ese campo tiene selector: para sustituirla un día por otra
receta, seleccionar **Otro plato** y escribir el nombre. Los primeros 2, 3 y 4 y
los segundos conservan campos de texto sencillos. Al volver a abrir una fecha
guardada se respeta la elección de ese día, incluida cualquier sustitución.

El texto público es **ENSALADA A TU MANERA (diseña tu ensalada con tus ingredientes
favoritos)**. La opción fija y los menús de ejemplo comparten ese mismo valor.

La ensalada usa tamaño pequeño (750 ml) en Menú del día y mediano (1000 ml) en
Medio menú. Ambos requieren bases, proteína, toppings y salsa. Las ensaladas de
receta fija, como ensalada mixta, no activan estos pasos.

## Bases y tamaños (prueba de septiembre de 2026)

Se ofrecen ocho bases y se pueden seleccionar una o dos distintas. En 750 ml
(Menú del día y ensalada pequeña + bocadillo), cualquier base puede elegirse sola.
En 1000 y 1500 ml, quinoa, arroz blanco, arroz integral, garbanzos y lentejas
requieren otra base. Cualquier pareja distinta es válida, incluso dos de esas
cinco bases. Mézclum, espinaca y pasta siguen pudiendo elegirse solas.

El selector identifica las bases que requieren mezcla con «Para combinar» y
explica cuándo falta la segunda. `isValidSaladBaseSelection` comparte la misma
regla con la validación del pedido; repetir una base no cuenta como una pareja.
Los garbanzos continúan disponibles como topping. No se modifican precios ni
pedidos históricos. En cocina, la ración total de base se reparte entre las dos
seleccionadas, en lugar de servir dos raciones completas.

## Incidencia del 14 de septiembre de 2026

El menú guardado contenía `ENSALDA A TUU MANERA`. La corrección del 5 de agosto
admitía `ENSALDA A TU MANERA`, pero seguía dependiendo de una coincidencia de
texto que no toleraba la letra repetida. Las pruebas anteriores del flujo usaban
grupos ya construidos con el nombre correcto; no ejercitaban la creación de esos
grupos a partir de los nombres reales del menú.

`normalizeMenuSaladChoice` normaliza los nombres antiguos reconocibles tanto en
la lectura pública como al guardar desde administración. No modifica por sí solo
los registros históricos. `isCustomSaladChoice` comparte la misma regla entre
el configurador, el cálculo de precio en el servidor y la presentación del pedido.
La selección fija de administración evita depender de escribir ese texto.

## Comprobaciones

`npm test` requiere Node 22 para ejecutar TypeScript. GitHub Actions ejecuta las
pruebas, la comprobación de tipos y la compilación en cada PR y cambio en main,
sin credenciales ni conexiones productivas. La compilación de Railway conserva
su comando habitual `npm run build`.

Las regresiones cubren el texto exacto de la incidencia, la configuración real
de ambos menús, las ensaladas independientes, la selección fija, el guardado y
la lectura del menú, y el rechazo de ingredientes incompletos o suplementos
incorrectos antes de crear un pedido o solicitar el pago. Las pruebas de pago
interceptan la base de datos, Stripe y el correo.
