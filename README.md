# GMAO Webapp

Panel estático de análisis CMMS preparado para GitHub Pages. Lee CSV en el navegador, deduplica filas exactas, calcula indicadores y dibuja gráficos según los filtros activos. Los datos seleccionados no se envían a un servidor.

## Uso local

Desde la raíz del repositorio:

```powershell
python -m http.server 8000 -d webapp
```

Abre `http://localhost:8000`. Se incluye `data/CMMS_grupo_D.csv` como dataset de demostración; utiliza **Cargar CSV** o arrastra otro archivo para cambiarlo.

La aplicación espera un CSV con encabezados CMMS como `OT`, `Tipo_mantenimiento`, `Fecha_inicio`, `Fecha_fin`, `Equipo`, `Área`, `Criticidad`, `Modo_falla`, `Downtime_h`, `Horas_mano_obra` y `Costo_total_CLP`. Acepta el formato original del proyecto, con fechas día-mes-año y apóstrofos iniciales.

## Informe PDF

**Exportar informe** prepara un informe con los filtros actuales y abre el diálogo de impresión del navegador. Selecciona **Guardar como PDF**. El reporte incluye los KPI, las gráficas, las tablas prioritarias y las limitaciones del análisis.

## GitHub Pages

El workflow `../.github/workflows/deploy-pages.yml` publica el contenido de esta carpeta cuando se actualiza `main` o `master`, o al ejecutarlo manualmente. En la configuración del repositorio, establece **Settings → Pages → Build and deployment → Source: GitHub Actions**.

Chart.js, Papa Parse, Lucide y las fuentes se cargan desde CDNs; el sitio necesita conexión a Internet para iniciar esas bibliotecas. El dataset de demostración sí forma parte de los archivos publicados.
