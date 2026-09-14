# Ensalada configurable en los menús

En administración, seleccionar **Ensalada a tu manera (configurable)** en uno
de los cuatro primeros platos. Esta opción guarda el nombre canónico sin tener
que escribirlo. Para sustituirla por una receta fija, seleccionar **Otro plato**.

La ensalada usa tamaño pequeño (750 ml) en Menú del día y mediano (1000 ml) en
Medio menú. Ambos requieren bases, proteína, toppings y salsa. Las ensaladas de
receta fija, como ensalada mixta, no activan estos pasos.

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
