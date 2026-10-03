(() => {
  "use strict";

  const REQUIRED_COLUMNS = ["OT", "Tipo_mantenimiento"];
  const TYPE_MAP = new Map([
    ["correctivo", "Correctivo"],
    ["preventivo", "Preventivo"],
    ["preventiva", "Preventivo"],
    ["predictivo", "Predictivo"],
  ]);
  const COLORS = {
    Correctivo: "#d87558",
    Predictivo: "#5289a0",
    Preventivo: "#168267",
    low: "#168267",
    acute: "#d8a23d",
    chronic: "#5289a0",
    severe: "#d87558",
    grid: "#e8eee9",
    ink: "#52665d",
  };
  const NUMBER_COLUMNS = [
    "Downtime_h",
    "Horas_mano_obra",
    "Costo_repuestos_CLP",
    "Costo_externo_CLP",
    "Costo_total_CLP",
    "Duración_OT_h",
    "Prioridad_SAP",
    "Tiempo_espera_h",
    "Tiempo_reparacion_h",
    "Cantidad_repuestos",
  ];

  const elements = {
    datasetStatus: document.querySelector("#dataset-status"),
    datasetName: document.querySelector("#dataset-name"),
    fileInput: document.querySelector("#file-input"),
    uploadTrigger: document.querySelector("#upload-trigger"),
    emptyUpload: document.querySelector("#empty-upload"),
    pdfButton: document.querySelector("#pdf-button"),
    pageTitle: document.querySelector("#page-title"),
    breadcrumbView: document.querySelector("#breadcrumb-view"),
    period: document.querySelector("#period-label"),
    dateFrom: document.querySelector("#date-from"),
    dateTo: document.querySelector("#date-to"),
    areaFilter: document.querySelector("#area-filter"),
    typeFilter: document.querySelector("#type-filter"),
    criticalityFilter: document.querySelector("#criticality-filter"),
    resetFilters: document.querySelector("#reset-filters"),
    recordSummary: document.querySelector("#record-summary"),
    qualitySummary: document.querySelector("#quality-summary"),
    refreshTime: document.querySelector("#refresh-time"),
    kpiOrders: document.querySelector("#kpi-orders"),
    kpiOrdersNote: document.querySelector("#kpi-orders-note"),
    kpiCorrective: document.querySelector("#kpi-corrective"),
    kpiDowntime: document.querySelector("#kpi-downtime"),
    kpiCost: document.querySelector("#kpi-cost"),
    kpiMttr: document.querySelector("#kpi-mttr"),
    kpiMttrNote: document.querySelector("#kpi-mttr-note"),
    emptyState: document.querySelector("#empty-state"),
    toast: document.querySelector("#toast"),
    dropOverlay: document.querySelector("#drop-overlay"),
    printReport: document.querySelector("#print-report"),
    assetTable: document.querySelector("#asset-table-body"),
    failureTable: document.querySelector("#failure-table-body"),
  };

  const state = {
    allRows: [],
    rows: [],
    fileName: "",
    view: "panorama",
    charts: {},
    toastTimer: null,
    dragDepth: 0,
  };

  const numberFormat = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 });
  const integerFormat = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });
  const currencyFormat = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });
  const monthFormat = new Intl.DateTimeFormat("es-CL", { month: "short", year: "2-digit" });
  const dateFormat = new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "short", year: "numeric" });

  function cleanText(value) {
    return String(value ?? "").trim().replace(/^'+/, "").trim();
  }

  function parseNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    let text = cleanText(value).replace(/[\s$]/g, "");
    if (!text) return 0;

    if (text.includes(",") && text.includes(".")) {
      if (text.lastIndexOf(",") > text.lastIndexOf(".")) {
        text = text.replace(/\./g, "").replace(",", ".");
      } else {
        text = text.replace(/,/g, "");
      }
    } else if (text.includes(",")) {
      const decimals = text.length - text.lastIndexOf(",") - 1;
      text = decimals > 0 && decimals <= 2 ? text.replace(",", ".") : text.replace(/,/g, "");
    }

    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function parseDate(value) {
    const text = cleanText(value);
    if (!text) return null;
    const match = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (match) {
      const [, day, month, year, hour = "0", minute = "0", second = "0"] = match;
      const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
      return Number.isNaN(date.getTime()) ? null : date;
    }
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function dateKey(date) {
    if (!date) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function csvRows(parsed, name) {
    if (!parsed.length) throw new Error("El archivo CSV no contiene registros.");
    const headers = Object.keys(parsed[0] ?? {});
    const missing = REQUIRED_COLUMNS.filter((required) => !headers.includes(required));
    if (missing.length) throw new Error(`Faltan columnas obligatorias: ${missing.join(", ")}.`);

    const seen = new Set();
    const clean = [];
    for (const source of parsed) {
      const row = {};
      for (const [key, value] of Object.entries(source)) row[key.trim()] = cleanText(value);
      const signature = JSON.stringify(row);
      if (seen.has(signature)) continue;
      seen.add(signature);

      row.Tipo_mantenimiento = TYPE_MAP.get((row.Tipo_mantenimiento ?? "").toLocaleLowerCase("es")) ?? row.Tipo_mantenimiento;
      for (const column of NUMBER_COLUMNS) {
        if (Object.hasOwn(row, column)) row[column] = parseNumber(row[column]);
      }
      row._fechaInicio = parseDate(row.Fecha_inicio);
      row._fechaFin = parseDate(row.Fecha_fin);
      row._fechaCreacion = parseDate(row["Fecha_creación"]);
      row._ot = cleanText(row.OT);
      row._equipo = cleanText(row.Equipo) || "Sin equipo";
      row._area = cleanText(row["Área"]) || "Sin área";
      row._tipoEquipo = cleanText(row.Tipo_equipo) || "Sin tipo";
      row._criticidad = cleanText(row.Criticidad) || "Sin criticidad";
      row._modoFalla = cleanText(row.Modo_falla) || "Sin modo de falla";
      row._estado = cleanText(row.Estado).toLocaleLowerCase("es");
      clean.push(row);
    }

    if (!clean.length) throw new Error("No se encontraron filas utilizables.");
    return { rows: clean, headers: headers.length, fileName: name };
  }

  function loadFile(file) {
    if (!file || !window.Papa) {
      showToast("No se pudo iniciar el lector CSV. Comprueba tu conexión y vuelve a cargar la página.", true);
      return;
    }
    setLoading(file.name);
    window.Papa.parse(file, {
      header: true,
      skipEmptyLines: "greedy",
      dynamicTyping: false,
      transformHeader: (header) => header.replace(/^\uFEFF/, "").trim(),
      complete(result) {
        if (result.errors.length) {
          const fatal = result.errors.find((error) => error.type === "Delimiter" || error.type === "Quotes");
          if (fatal) {
            setError();
            showToast(`No se pudo leer el CSV: ${fatal.message}`, true);
            return;
          }
        }
        try {
          const parsed = csvRows(result.data, file.name);
          applyDataset(parsed.rows, parsed.headers, parsed.fileName, result.data.length - parsed.rows.length);
        } catch (error) {
          setError();
          showToast(error.message || "El dataset no tiene el formato esperado.", true);
        }
      },
      error(error) {
        setError();
        showToast(`Error al leer el archivo: ${error.message}`, true);
      },
    });
  }

  function setLoading(name) {
    elements.datasetStatus.classList.remove("is-error");
    elements.datasetStatus.classList.add("is-loading");
    elements.datasetName.textContent = name;
  }

  function setError() {
    elements.datasetStatus.classList.remove("is-loading");
    elements.datasetStatus.classList.add("is-error");
    if (!state.allRows.length) elements.datasetName.textContent = "Sin dataset";
  }

  function applyDataset(rows, headerCount, fileName, duplicates) {
    state.allRows = rows;
    state.fileName = fileName;
    state.rows = rows;
    elements.datasetStatus.classList.remove("is-loading", "is-error");
    elements.datasetName.textContent = fileName;
    elements.emptyState.hidden = true;
    document.querySelector(".filter-bar").hidden = false;
    document.querySelector(".data-line").hidden = false;
    document.querySelector(".kpi-grid").hidden = false;
    elements.pdfButton.disabled = false;
    populateFilters(rows);
    setDateRange(rows);
    applyFilters();
    const quality = duplicates
      ? `${integerFormat.format(duplicates)} duplicados retirados`
      : `${integerFormat.format(headerCount)} campos disponibles`;
    elements.qualitySummary.textContent = quality;
    showToast(`${integerFormat.format(rows.length)} registros únicos listos para analizar.`);
  }

  function uniqueSorted(rows, getValue) {
    return [...new Set(rows.map(getValue).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "es", { sensitivity: "base" }));
  }

  function fillSelect(select, values, firstLabel) {
    select.replaceChildren(new Option(firstLabel, ""));
    for (const value of values) select.add(new Option(value, value));
  }

  function populateFilters(rows) {
    fillSelect(elements.areaFilter, uniqueSorted(rows, (row) => row._area), "Todas las áreas");
    fillSelect(elements.typeFilter, uniqueSorted(rows, (row) => row.Tipo_mantenimiento), "Todos los tipos");
    fillSelect(elements.criticalityFilter, uniqueSorted(rows, (row) => row._criticidad), "Todas");
  }

  function setDateRange(rows) {
    const dates = rows.map((row) => row._fechaInicio).filter(Boolean).sort((a, b) => a - b);
    if (!dates.length) {
      elements.dateFrom.value = "";
      elements.dateTo.value = "";
      elements.dateFrom.min = "";
      elements.dateFrom.max = "";
      elements.dateTo.min = "";
      elements.dateTo.max = "";
      elements.period.textContent = "Fechas no disponibles";
      return;
    }
    const first = dateKey(dates[0]);
    const last = dateKey(dates.at(-1));
    elements.dateFrom.min = first;
    elements.dateFrom.max = last;
    elements.dateTo.min = first;
    elements.dateTo.max = last;
    elements.dateFrom.value = first;
    elements.dateTo.value = last;
    elements.period.textContent = `${dateFormat.format(dates[0])} — ${dateFormat.format(dates.at(-1))}`;
  }

  function applyFilters() {
    const start = elements.dateFrom.value;
    const end = elements.dateTo.value;
    const area = elements.areaFilter.value;
    const type = elements.typeFilter.value;
    const criticality = elements.criticalityFilter.value;

    state.rows = state.allRows.filter((row) => {
      const date = dateKey(row._fechaInicio);
      if (start && date && date < start) return false;
      if (end && date && date > end) return false;
      if (area && row._area !== area) return false;
      if (type && row.Tipo_mantenimiento !== type) return false;
      if (criticality && row._criticidad !== criticality) return false;
      return true;
    });
    renderDashboard();
  }

  function summarize(rows) {
    const totalOt = new Set(rows.map((row) => row._ot).filter(Boolean)).size;
    const types = [...new Set(rows.map((row) => row.Tipo_mantenimiento).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
    const totalHours = sum(rows, "Horas_mano_obra");
    const totalDowntime = sum(rows, "Downtime_h");
    const totalCost = sum(rows, "Costo_total_CLP");
    const impact = types.map((type) => {
      const group = rows.filter((row) => row.Tipo_mantenimiento === type);
      return {
        type,
        ot: new Set(group.map((row) => row._ot).filter(Boolean)).size,
        hh: sum(group, "Horas_mano_obra"),
        downtime: sum(group, "Downtime_h"),
        cost: sum(group, "Costo_total_CLP"),
      };
    });
    for (const item of impact) {
      item.otPercent = totalOt ? (item.ot / totalOt) * 100 : 0;
      item.hhPercent = totalHours ? (item.hh / totalHours) * 100 : 0;
      item.downtimePercent = totalDowntime ? (item.downtime / totalDowntime) * 100 : 0;
      item.costPercent = totalCost ? (item.cost / totalCost) * 100 : 0;
    }
    return { totalOt, types, totalHours, totalDowntime, totalCost, impact };
  }

  function sum(rows, field) {
    return rows.reduce((total, row) => total + (typeof row[field] === "number" ? row[field] : 0), 0);
  }

  function mttrRows(rows) {
    return rows.filter((row) => row.Tipo_mantenimiento === "Correctivo"
      && row._estado === "cerrada"
      && row._fechaInicio
      && row._fechaFin
      && row._fechaFin > row._fechaInicio);
  }

  function calculateMttr(rows) {
    const repairs = mttrRows(rows);
    if (!repairs.length) return { mean: 0, median: 0, count: 0 };
    const durations = repairs.map((row) => (row._fechaFin - row._fechaInicio) / 3600000).sort((a, b) => a - b);
    const mean = durations.reduce((total, value) => total + value, 0) / durations.length;
    const middle = Math.floor(durations.length / 2);
    const median = durations.length % 2 ? durations[middle] : (durations[middle - 1] + durations[middle]) / 2;
    return { mean, median, count: new Set(repairs.map((row) => row._ot).filter(Boolean)).size };
  }

  function byEquipment(rows) {
    const groups = groupBy(rows, (row) => row._equipo);
    return [...groups.entries()].map(([name, group]) => ({ name, value: sum(group, "Downtime_h") }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }

  function jackknife(rows, dimension = "_equipo") {
    const validRows = mttrRows(rows).filter((row) => cleanText(row[dimension]));
    const groups = groupBy(validRows, (row) => cleanText(row[dimension]));
    const assets = [...groups.entries()].map(([name, group]) => {
      const failures = new Set(group.map((row) => row._ot).filter(Boolean)).size;
      const downtime = sum(group, "Downtime_h");
      return {
        name,
        failures,
        downtime,
        mttr: failures ? downtime / failures : 0,
        type: group[0]?._tipoEquipo || "Sin tipo",
        criticality: group[0]?._criticidad || "Sin criticidad",
      };
    }).filter((asset) => asset.failures > 0);
    const totalFailures = assets.reduce((total, asset) => total + asset.failures, 0);
    const assetCount = assets.length;
    const frequencyLimit = assetCount ? totalFailures / assetCount : 0;
    const mttrLimit = totalFailures ? assets.reduce((total, asset) => total + asset.downtime, 0) / totalFailures : 0;

    for (const asset of assets) {
      asset.frequencyNorm = frequencyLimit ? asset.failures / frequencyLimit : 0;
      asset.mttrNorm = mttrLimit ? asset.mttr / mttrLimit : 0;
      asset.risk = asset.frequencyNorm * asset.mttrNorm;
      if (asset.frequencyNorm >= 1 && asset.mttrNorm >= 1) asset.quadrant = "Grave";
      else if (asset.frequencyNorm >= 1) asset.quadrant = "Crónico";
      else if (asset.mttrNorm >= 1) asset.quadrant = "Agudo";
      else asset.quadrant = "Bajo control";
    }
    assets.sort((a, b) => b.risk - a.risk);
    return { assets: assets.slice(0, 60), frequencyLimit, mttrLimit };
  }

  function paretoFailures(rows) {
    const failures = rows.filter((row) => row.Tipo_mantenimiento === "Correctivo" && row._modoFalla !== "Sin modo de falla");
    const groups = groupBy(failures, (row) => row._modoFalla);
    const result = [...groups.entries()].map(([name, group]) => ({
      name,
      events: new Set(group.map((row) => row._ot).filter(Boolean)).size,
      downtime: sum(group, "Downtime_h"),
      cost: sum(group, "Costo_total_CLP"),
    })).sort((a, b) => b.events - a.events);
    const total = result.reduce((value, item) => value + item.events, 0);
    let cumulative = 0;
    for (const item of result) {
      item.percent = total ? (item.events / total) * 100 : 0;
      cumulative += item.percent;
      item.cumulative = cumulative;
    }
    return result;
  }

  function monthlyOrders(rows) {
    const grouped = new Map();
    for (const row of rows) {
      if (!row._fechaInicio || !row._ot) continue;
      const date = row._fechaInicio;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      if (!grouped.has(key)) grouped.set(key, { date: new Date(date.getFullYear(), date.getMonth(), 1), orders: new Set() });
      grouped.get(key).orders.add(row._ot);
    }
    return [...grouped.values()].sort((a, b) => a.date - b.date).map((item) => ({
      label: monthFormat.format(item.date).replace(".", ""),
      count: item.orders.size,
    }));
  }

  function groupBy(items, getKey) {
    const groups = new Map();
    for (const item of items) {
      const key = getKey(item);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    return groups;
  }

  function renderDashboard() {
    const rows = state.rows;
    const summary = summarize(rows);
    const mttr = calculateMttr(rows);
    const distinct = new Set(rows.map((row) => row._ot).filter(Boolean)).size;
    const filtered = state.allRows.length - rows.length;
    const dates = rows.map((row) => row._fechaInicio).filter(Boolean).sort((a, b) => a - b);

    elements.kpiOrders.textContent = integerFormat.format(summary.totalOt);
    elements.kpiOrdersNote.textContent = `${integerFormat.format(rows.length)} registros${filtered ? ` · ${integerFormat.format(filtered)} fuera del filtro` : ""}`;
    const corrective = summary.impact.find((item) => item.type === "Correctivo");
    elements.kpiCorrective.textContent = `${numberFormat.format(corrective?.otPercent ?? 0)}%`;
    elements.kpiDowntime.textContent = numberFormat.format(summary.totalDowntime);
    elements.kpiCost.textContent = compactCurrency(summary.totalCost);
    elements.kpiMttr.textContent = numberFormat.format(mttr.mean);
    elements.kpiMttrNote.textContent = `${integerFormat.format(mttr.count)} reparaciones válidas · mediana ${numberFormat.format(mttr.median)} h`;

    if (dates.length) {
      elements.period.textContent = `${dateFormat.format(dates[0])} — ${dateFormat.format(dates.at(-1))}`;
    } else {
      elements.period.textContent = "Fechas no disponibles";
    }
    elements.recordSummary.textContent = `${integerFormat.format(summary.totalOt)} OT únicas · ${integerFormat.format(rows.length)} registros visibles`;
    elements.refreshTime.textContent = `Actualizado ${new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit" }).format(new Date())}`;

    if (state.view === "panorama") renderPanorama(rows, summary);
    if (state.view === "activos") renderAssets(rows);
    if (state.view === "fallas") renderFailures(rows);
  }

  function compactCurrency(value) {
    if (value >= 1_000_000) return `$${numberFormat.format(value / 1_000_000)} M`;
    if (value >= 100_000) return `$${integerFormat.format(value / 1_000)} mil`;
    return `$${integerFormat.format(value)}`;
  }

  function chartBaseOptions() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 360 },
      interaction: { intersect: false, mode: "index" },
      plugins: {
        legend: { labels: { usePointStyle: true, boxWidth: 7, boxHeight: 7, padding: 14, color: COLORS.ink, font: { family: "DM Sans", size: 9 } } },
        tooltip: { backgroundColor: "#173b32", titleFont: { family: "DM Sans", size: 11 }, bodyFont: { family: "IBM Plex Mono", size: 9 }, padding: 10, cornerRadius: 3 },
      },
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { color: COLORS.ink, font: { family: "DM Sans", size: 9 }, maxRotation: 0, autoSkip: true } },
        y: { beginAtZero: true, grid: { color: COLORS.grid }, border: { display: false }, ticks: { color: COLORS.ink, font: { family: "IBM Plex Mono", size: 8 } } },
      },
    };
  }

  function upsertChart(key, canvasId, config) {
    if (!window.Chart) return;
    const canvas = document.getElementById(canvasId);
    if (!canvas || !canvas.offsetParent) return;
    if (state.charts[key]) state.charts[key].destroy();
    state.charts[key] = new window.Chart(canvas, config);
  }

  function renderPanorama(rows, summary) {
    const types = summary.impact.map((item) => item.type);
    const base = chartBaseOptions();
    upsertChart("impact", "impact-chart", {
      type: "bar",
      data: {
        labels: types,
        datasets: [
          { label: "% OT", data: summary.impact.map((item) => item.otPercent), backgroundColor: "#173b32", borderRadius: 2, maxBarThickness: 19 },
          { label: "% Horas-hombre", data: summary.impact.map((item) => item.hhPercent), backgroundColor: "#8eb9a6", borderRadius: 2, maxBarThickness: 19 },
          { label: "% Downtime", data: summary.impact.map((item) => item.downtimePercent), backgroundColor: COLORS.coral, borderRadius: 2, maxBarThickness: 19 },
          { label: "% Costo", data: summary.impact.map((item) => item.costPercent), backgroundColor: COLORS.amber, borderRadius: 2, maxBarThickness: 19 },
        ],
      },
      options: { ...base, scales: { ...base.scales, y: { ...base.scales.y, max: 100, ticks: { ...base.scales.y.ticks, callback: (value) => `${value}%` } } } },
    });

    upsertChart("orders", "ot-chart", {
      type: "bar",
      data: { labels: types, datasets: [{ label: "OT únicas", data: summary.impact.map((item) => item.ot), backgroundColor: types.map((type) => COLORS[type] ?? COLORS.blue), borderRadius: 2, maxBarThickness: 44 }] },
      options: { ...base, plugins: { ...base.plugins, legend: { display: false } }, scales: { ...base.scales, y: { ...base.scales.y, ticks: { ...base.scales.y.ticks, precision: 0 } } } },
    });

    upsertChart("labor", "labor-chart", {
      type: "bar",
      data: { labels: types, datasets: [{ label: "Horas-hombre", data: summary.impact.map((item) => item.hh), backgroundColor: types.map((type) => COLORS[type] ?? COLORS.blue), borderRadius: 2, maxBarThickness: 44 }] },
      options: { ...base, plugins: { ...base.plugins, legend: { display: false } } },
    });

    const months = monthlyOrders(rows);
    upsertChart("trend", "trend-chart", {
      type: "line",
      data: { labels: months.map((item) => item.label), datasets: [{ label: "OT únicas", data: months.map((item) => item.count), borderColor: COLORS.green, backgroundColor: "rgba(22,130,103,.10)", fill: true, tension: 0.28, borderWidth: 2, pointRadius: 2, pointHoverRadius: 4 }] },
      options: { ...base, interaction: { intersect: false, mode: "index" }, scales: { ...base.scales, y: { ...base.scales.y, ticks: { ...base.scales.y.ticks, precision: 0 } } } },
    });

    const equipment = byEquipment(rows).reverse();
    upsertChart("downtime", "downtime-chart", {
      type: "bar",
      data: { labels: equipment.map((item) => item.name), datasets: [{ label: "Downtime [h]", data: equipment.map((item) => item.value), backgroundColor: equipment.map((_, index) => index === equipment.length - 1 ? COLORS.coral : "#91b6a3"), borderRadius: 2, maxBarThickness: 15 }] },
      options: { ...base, indexAxis: "y", plugins: { ...base.plugins, legend: { display: false } }, scales: { x: { ...base.scales.x, grid: { color: COLORS.grid } }, y: { ...base.scales.y, grid: { display: false }, ticks: { ...base.scales.y.ticks, font: { family: "IBM Plex Mono", size: 8 } } } } },
    });

    upsertChart("cost", "cost-chart", {
      type: "doughnut",
      data: { labels: types, datasets: [{ data: summary.impact.map((item) => item.cost / 1_000_000), backgroundColor: types.map((type) => COLORS[type] ?? COLORS.blue), borderColor: "#fff", borderWidth: 3, hoverOffset: 4 }] },
      options: { ...base, cutout: "70%", plugins: { ...base.plugins, legend: { position: "bottom", labels: { ...base.plugins.legend.labels, padding: 16 } }, tooltip: { ...base.plugins.tooltip, callbacks: { label: (context) => `${context.label}: ${numberFormat.format(context.raw)} M CLP` } } }, scales: { x: { display: false }, y: { display: false } } },
    });

    const costTeams = [...groupBy(rows, (row) => row._equipo).entries()]
      .map(([name, group]) => ({ name, value: sum(group, "Costo_total_CLP") }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
      .reverse();
    upsertChart("teamCost", "cost-team-chart", {
      type: "bar",
      data: { labels: costTeams.map((item) => item.name), datasets: [{ label: "Costo [M CLP]", data: costTeams.map((item) => item.value / 1_000_000), backgroundColor: costTeams.map((_, index) => index === costTeams.length - 1 ? COLORS.amber : "#8eb9a6"), borderRadius: 2, maxBarThickness: 15 }] },
      options: { ...base, indexAxis: "y", plugins: { ...base.plugins, legend: { display: false } }, scales: { x: { ...base.scales.x, grid: { color: COLORS.grid } }, y: { ...base.scales.y, grid: { display: false } } } },
    });
  }

  function renderAssets(rows) {
    const result = jackknife(rows);
    renderAssetTable(result.assets.slice(0, 10));
    const points = result.assets.filter((asset) => asset.frequencyNorm > 0 && asset.mttrNorm > 0).map((asset) => ({
      x: asset.frequencyNorm,
      y: asset.mttrNorm,
      name: asset.name,
      risk: asset.risk,
      quadrant: asset.quadrant,
      criticality: asset.criticality,
    }));
    const base = chartBaseOptions();
    const quadrants = {
      id: "quadrantLabels",
      afterDraw(chart) {
        const { ctx, chartArea } = chart;
        if (!chartArea) return;
        ctx.save();
        ctx.font = "600 9px DM Sans";
        ctx.fillStyle = "rgba(64, 89, 82, .62)";
        const xmid = chart.scales.x.getPixelForValue(1);
        const ymid = chart.scales.y.getPixelForValue(1);
        ctx.fillText("AGUDO", chartArea.left + 9, chartArea.top + 14);
        ctx.fillText("GRAVE", xmid + 8, chartArea.top + 14);
        ctx.fillText("BAJO CONTROL", chartArea.left + 9, ymid + 16);
        ctx.fillText("CRÓNICO", xmid + 8, ymid + 16);
        ctx.restore();
      },
    };
    upsertChart("jackknife", "jackknife-chart", {
      type: "scatter",
      data: { datasets: [{ label: "Equipo", data: points, pointRadius: (context) => Math.min(9, 3 + Math.sqrt(context.raw?.risk ?? 0)), pointHoverRadius: 8, backgroundColor: (context) => quadrantColor(context.raw?.quadrant), borderColor: "#fff", borderWidth: 1 }] },
      options: {
        ...base,
        plugins: {
          ...base.plugins,
          legend: { display: false },
          tooltip: { ...base.plugins.tooltip, callbacks: { label: (context) => { const point = context.raw; return [`${point.name}`, `${point.quadrant} · R* ${numberFormat.format(point.risk)}`, `${numberFormat.format(point.x)} N* · ${numberFormat.format(point.y)} MTTR*`, `Criticidad ${point.criticality}`]; } } },
        },
        scales: {
          x: { ...base.scales.x, type: "logarithmic", min: 0.1, title: { display: true, text: "Frecuencia normalizada · N*", color: COLORS.ink, font: { family: "DM Sans", size: 9 } }, grid: { color: COLORS.grid } },
          y: { ...base.scales.y, type: "logarithmic", min: 0.1, title: { display: true, text: "Downtime medio normalizado · MTTR*", color: COLORS.ink, font: { family: "DM Sans", size: 9 } }, grid: { color: COLORS.grid } },
        },
      },
      plugins: [quadrants],
    });

    const repairs = mttrRows(rows);
    const byType = [...groupBy(repairs, (row) => row._tipoEquipo).entries()]
      .map(([name, group]) => {
        const hours = group.map((row) => (row._fechaFin - row._fechaInicio) / 3600000);
        return { name, mean: hours.reduce((total, value) => total + value, 0) / hours.length, count: new Set(group.map((row) => row._ot).filter(Boolean)).size };
      })
      .sort((a, b) => b.mean - a.mean)
      .slice(0, 12)
      .reverse();
    upsertChart("mttrType", "mttr-type-chart", {
      type: "bar",
      data: { labels: byType.map((item) => item.name), datasets: [{ label: "MTTR [h]", data: byType.map((item) => item.mean), backgroundColor: byType.map((item) => item.mean >= (calculateMttr(rows).mean || 0) ? COLORS.coral : "#8eb9a6"), borderRadius: 2, maxBarThickness: 17 }] },
      options: { ...base, indexAxis: "y", plugins: { ...base.plugins, legend: { display: false }, tooltip: { ...base.plugins.tooltip, callbacks: { afterLabel: (context) => `${integerFormat.format(byType[context.dataIndex]?.count ?? 0)} reparaciones válidas` } } }, scales: { x: { ...base.scales.x, grid: { color: COLORS.grid } }, y: { ...base.scales.y, grid: { display: false } } } },
    });
  }

  function quadrantColor(quadrant) {
    if (quadrant === "Grave") return COLORS.severe;
    if (quadrant === "Agudo") return COLORS.acute;
    if (quadrant === "Crónico") return COLORS.chronic;
    return COLORS.low;
  }

  function renderAssetTable(assets) {
    elements.assetTable.replaceChildren();
    if (!assets.length) {
      elements.assetTable.innerHTML = '<tr><td colspan="4">No hay reparaciones válidas en este filtro.</td></tr>';
      return;
    }
    for (const asset of assets) {
      const row = document.createElement("tr");
      row.innerHTML = `<td title="${escapeHtml(asset.name)}">${escapeHtml(asset.name)}</td><td>${integerFormat.format(asset.failures)}</td><td>${numberFormat.format(asset.mttr)} h</td><td><span class="risk-chip ${riskClass(asset.quadrant)}">${numberFormat.format(asset.risk)}</span></td>`;
      elements.assetTable.append(row);
    }
  }

  function renderFailures(rows) {
    const pareto = paretoFailures(rows);
    const top = pareto.slice(0, 10);
    const base = chartBaseOptions();
    const frequencyCanvas = document.getElementById("failure-chart");
    if (frequencyCanvas?.offsetParent) {
      upsertChart("failure", "failure-chart", {
        type: "bar",
        data: {
          labels: top.map((item) => shortLabel(item.name, 22)),
          datasets: [
            { label: "Eventos", data: top.map((item) => item.events), backgroundColor: "#173b32", borderRadius: 2, maxBarThickness: 24, yAxisID: "y" },
            { label: "% acumulado", data: top.map((item) => item.cumulative), type: "line", borderColor: COLORS.coral, backgroundColor: COLORS.coral, pointRadius: 2, pointHoverRadius: 4, borderWidth: 1.7, tension: 0.18, yAxisID: "y1" },
          ],
        },
        options: {
          ...base,
          plugins: { ...base.plugins, tooltip: { ...base.plugins.tooltip, callbacks: { title: (items) => top[items[0]?.dataIndex]?.name ?? "" } } },
          scales: {
            x: { ...base.scales.x, ticks: { ...base.scales.x.ticks, maxRotation: 35, minRotation: 0 } },
            y: { ...base.scales.y, title: { display: true, text: "OT únicas", color: COLORS.ink, font: { family: "DM Sans", size: 9 } }, ticks: { ...base.scales.y.ticks, precision: 0 } },
            y1: { beginAtZero: true, max: 100, position: "right", grid: { display: false }, border: { display: false }, ticks: { color: COLORS.ink, font: { family: "IBM Plex Mono", size: 8 }, callback: (value) => `${value}%` } },
          },
        },
      });
    }

    const byDowntime = [...pareto].sort((a, b) => b.downtime - a.downtime).slice(0, 10).reverse();
    upsertChart("failureDowntime", "failure-downtime-chart", {
      type: "bar",
      data: { labels: byDowntime.map((item) => shortLabel(item.name, 25)), datasets: [{ label: "Downtime [h]", data: byDowntime.map((item) => item.downtime), backgroundColor: "#8eb9a6", borderRadius: 2, maxBarThickness: 17 }] },
      options: { ...base, indexAxis: "y", plugins: { ...base.plugins, legend: { display: false }, tooltip: { ...base.plugins.tooltip, callbacks: { title: (items) => byDowntime[items[0]?.dataIndex]?.name ?? "" } } }, scales: { x: { ...base.scales.x, grid: { color: COLORS.grid } }, y: { ...base.scales.y, grid: { display: false } } } },
    });

    const byCost = [...pareto].sort((a, b) => b.cost - a.cost).slice(0, 10).reverse();
    upsertChart("failureCost", "failure-cost-chart", {
      type: "bar",
      data: { labels: byCost.map((item) => shortLabel(item.name, 25)), datasets: [{ label: "Costo [M CLP]", data: byCost.map((item) => item.cost / 1_000_000), backgroundColor: "#d8a23d", borderRadius: 2, maxBarThickness: 17 }] },
      options: { ...base, indexAxis: "y", plugins: { ...base.plugins, legend: { display: false }, tooltip: { ...base.plugins.tooltip, callbacks: { title: (items) => byCost[items[0]?.dataIndex]?.name ?? "", label: (context) => `${numberFormat.format(context.raw)} M CLP` } } }, scales: { x: { ...base.scales.x, grid: { color: COLORS.grid } }, y: { ...base.scales.y, grid: { display: false } } } },
    });

    const modeJackknife = jackknife(rows, "Modo_falla");
    const modePoints = modeJackknife.assets.filter((asset) => asset.frequencyNorm > 0 && asset.mttrNorm > 0).map((asset) => ({
      x: asset.frequencyNorm,
      y: asset.mttrNorm,
      name: asset.name,
      risk: asset.risk,
      quadrant: asset.quadrant,
    }));
    upsertChart("failureJackknife", "failure-jackknife-chart", {
      type: "scatter",
      data: { datasets: [{ label: "Modo de falla", data: modePoints, pointRadius: (context) => Math.min(9, 3 + Math.sqrt(context.raw?.risk ?? 0)), pointHoverRadius: 8, backgroundColor: (context) => quadrantColor(context.raw?.quadrant), borderColor: "#fff", borderWidth: 1 }] },
      options: {
        ...base,
        plugins: { ...base.plugins, legend: { display: false }, tooltip: { ...base.plugins.tooltip, callbacks: { label: (context) => { const point = context.raw; return [`${point.name}`, `${point.quadrant} · R* ${numberFormat.format(point.risk)}`, `${numberFormat.format(point.x)} N* · ${numberFormat.format(point.y)} MTTR*`]; } } } },
        scales: {
          x: { ...base.scales.x, type: "logarithmic", min: 0.1, title: { display: true, text: "Frecuencia normalizada · N*", color: COLORS.ink, font: { family: "DM Sans", size: 9 } }, grid: { color: COLORS.grid } },
          y: { ...base.scales.y, type: "logarithmic", min: 0.1, title: { display: true, text: "Downtime medio normalizado · MTTR*", color: COLORS.ink, font: { family: "DM Sans", size: 9 } }, grid: { color: COLORS.grid } },
        },
      },
    });
    renderFailureTable(top);
  }

  function renderFailureTable(failures) {
    elements.failureTable.replaceChildren();
    if (!failures.length) {
      elements.failureTable.innerHTML = '<tr><td colspan="5">No hay modos de falla correctivos en este filtro.</td></tr>';
      return;
    }
    for (const item of failures) {
      const row = document.createElement("tr");
      row.innerHTML = `<td title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</td><td>${integerFormat.format(item.events)}</td><td>${numberFormat.format(item.cumulative)}%</td><td>${numberFormat.format(item.downtime)} h</td><td>${compactCurrency(item.cost)}</td>`;
      elements.failureTable.append(row);
    }
  }

  function riskClass(quadrant) {
    if (quadrant === "Agudo") return "risk-acute";
    if (quadrant === "Crónico") return "risk-chronic";
    if (quadrant === "Bajo control") return "risk-calm";
    return "";
  }

  function shortLabel(value, max) {
    return value.length > max ? `${value.slice(0, max - 1)}…` : value;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  }

  function setView(view) {
    state.view = view;
    const labels = { panorama: "Panorama", activos: "Activos", fallas: "Modos de falla" };
    document.querySelectorAll(".nav-item[data-view]").forEach((button) => {
      const active = button.dataset.view === view;
      button.classList.toggle("is-active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    document.querySelectorAll(".view-panel").forEach((panel) => {
      const active = panel.dataset.panel === view;
      panel.hidden = !active;
      panel.classList.toggle("is-active", active);
    });
    elements.breadcrumbView.textContent = labels[view];
    renderDashboard();
  }

  function resetFilters() {
    const dates = state.allRows.map((row) => row._fechaInicio).filter(Boolean).sort((a, b) => a - b);
    if (dates.length) {
      elements.dateFrom.value = dateKey(dates[0]);
      elements.dateTo.value = dateKey(dates.at(-1));
    }
    elements.areaFilter.value = "";
    elements.typeFilter.value = "";
    elements.criticalityFilter.value = "";
    applyFilters();
  }

  function showToast(message, isError = false) {
    window.clearTimeout(state.toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.toggle("is-error", isError);
    elements.toast.classList.add("is-visible");
    state.toastTimer = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 3600);
  }

  function reportMarkup() {
    const rows = state.rows;
    const summary = summarize(rows);
    const mttr = calculateMttr(rows);
    const corrective = summary.impact.find((item) => item.type === "Correctivo");
    const faults = paretoFailures(rows);
    const assets = jackknife(rows).assets;
    const modeAssets = jackknife(rows, "Modo_falla").assets;
    const firstFault = faults[0];
    const firstAsset = assets[0];
    const chartImage = (key, extraClass = "") => {
      const chart = state.charts[key];
      return chart ? `<img class="report-chart ${extraClass}" src="${chart.toBase64Image("image/png", 1)}" alt="Gráfico ${escapeHtml(key)}">` : "";
    };
    const metrics = [
      ["Órdenes únicas", integerFormat.format(summary.totalOt)],
      ["Correctivo", `${numberFormat.format(corrective?.otPercent ?? 0)}%`],
      ["Horas-hombre", `${numberFormat.format(summary.totalHours)} h`],
      ["Downtime", `${numberFormat.format(summary.totalDowntime)} h`],
      ["Costo directo", `${currencyFormat.format(summary.totalCost)} CLP`],
      ["MTTR correctivo", `${numberFormat.format(mttr.mean)} h`],
    ];
    const metricMarkup = metrics.map(([label, value]) => `<div class="report-metric"><small>${escapeHtml(label.toUpperCase())}</small><strong>${escapeHtml(value)}</strong></div>`).join("");
    const impactRows = summary.impact.map((item) => `<tr><td>${escapeHtml(item.type)}</td><td>${numberFormat.format(item.otPercent)}%</td><td>${numberFormat.format(item.hhPercent)}%</td><td>${numberFormat.format(item.downtimePercent)}%</td><td>${numberFormat.format(item.costPercent)}%</td></tr>`).join("");
    const failureRows = faults.slice(0, 8).map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${integerFormat.format(item.events)}</td><td>${numberFormat.format(item.cumulative)}%</td><td>${numberFormat.format(item.downtime)} h</td><td>${compactCurrency(item.cost)}</td></tr>`).join("");
    const assetRows = assets.slice(0, 8).map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.criticality)}</td><td>${integerFormat.format(item.failures)}</td><td>${numberFormat.format(item.mttr)} h</td><td>${numberFormat.format(item.risk)}</td><td>${escapeHtml(item.quadrant)}</td></tr>`).join("");
    const modeRows = modeAssets.slice(0, 8).map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${integerFormat.format(item.failures)}</td><td>${numberFormat.format(item.mttr)} h</td><td>${numberFormat.format(item.risk)}</td><td>${escapeHtml(item.quadrant)}</td></tr>`).join("");
    const period = rows.map((row) => row._fechaInicio).filter(Boolean).sort((a, b) => a - b);
    const periodText = period.length ? `${dateFormat.format(period[0])} — ${dateFormat.format(period.at(-1))}` : "Fechas no disponibles";
    const thresholdMessage = corrective?.otPercent >= 50
      ? "La proporción de OT correctivas supera la mitad del total. Revise la estrategia preventiva y los modos de falla recurrentes."
      : "La proporción de OT correctivas es inferior a la mitad. Mantenga el seguimiento de su impacto en recursos, downtime y costo.";
    const priorities = [
      firstFault ? `Revisar causa raíz y acciones correctivas para ${firstFault.name}, el modo de falla con mayor frecuencia.` : "Validar la disponibilidad de modos de falla en las órdenes correctivas.",
      firstAsset ? `Verificar en terreno ${firstAsset.name}, activo con mayor riesgo relativo (${firstAsset.quadrant}).` : "Asegurar suficientes órdenes con fechas válidas para analizar activos.",
      "Contrastar downtime, frecuencia y criticidad antes de priorizar recursos de mantenimiento.",
      "Revisar calidad de fechas, estados y duraciones antes de comparar el MTTR entre períodos.",
      "Integrar horas de operación del activo para estimar MTBF y disponibilidad formal.",
    ];

    elements.printReport.innerHTML = `
      <article class="report-cover">
        <div class="report-brand"><span class="report-brand-mark"></span> GMAO · ACTIVOS Y CONFIABILIDAD</div>
        <p class="report-eyebrow">INFORME EJECUTIVO DE MANTENIMIENTO</p>
        <h1>Desempeño y confiabilidad<br><span>del mantenimiento.</span></h1>
        <p class="report-subtitle">Análisis operacional de órdenes de trabajo CMMS. Resultados y prioridades calculados desde el dataset cargado.</p>
        <div class="report-cover-meta"><strong>Dataset:</strong> ${escapeHtml(state.fileName)}<br><strong>Período:</strong> ${escapeHtml(periodText)}<br><strong>Emisión:</strong> ${escapeHtml(dateFormat.format(new Date()))}<br><strong>Registros analizados:</strong> ${integerFormat.format(rows.length)}</div>
      </article>
      <section class="report-section"><h2>01 · Resumen ejecutivo</h2><div class="report-metrics">${metricMarkup}</div><div class="report-callout"><strong>Hallazgo clave.</strong> ${escapeHtml(thresholdMessage)} El mantenimiento correctivo concentra ${numberFormat.format(corrective?.otPercent ?? 0)}% de las OT, ${numberFormat.format(corrective?.hhPercent ?? 0)}% de las HH, ${numberFormat.format(corrective?.downtimePercent ?? 0)}% del downtime y ${numberFormat.format(corrective?.costPercent ?? 0)}% del costo directo.</div><h3>Distribución por estrategia</h3><table class="report-table"><thead><tr><th>Tipo</th><th>% OT</th><th>% HH</th><th>% downtime</th><th>% costo</th></tr></thead><tbody>${impactRows}</tbody></table>${chartImage("impact", "report-chart-short")}${chartImage("orders", "report-chart-short")}${chartImage("labor", "report-chart-short")}${chartImage("trend", "report-chart-short")}</section>
      <section class="report-section"><h2>02 · Mantenibilidad y criticidad</h2><h3>MTTR correctivo</h3><p>MTTR medio: <strong>${numberFormat.format(mttr.mean)} h</strong> · Mediana: <strong>${numberFormat.format(mttr.median)} h</strong> · ${integerFormat.format(mttr.count)} reparaciones cerradas con fechas válidas.</p>${chartImage("jackknife", "report-chart")}
        ${chartImage("mttrType", "report-chart-short")}<table class="report-table"><thead><tr><th>Equipo</th><th>Crit.</th><th>Fallas</th><th>MTTR JK</th><th>R*</th><th>Cuadrante</th></tr></thead><tbody>${assetRows}</tbody></table>${chartImage("downtime", "report-chart-short")}${chartImage("teamCost", "report-chart-short")}</section>
      <section class="report-section"><h2>03 · Modos de falla prioritarios</h2>${chartImage("failure", "report-chart-short")}${chartImage("failureDowntime", "report-chart-short")}${chartImage("failureCost", "report-chart-short")}<table class="report-table"><thead><tr><th>Modo de falla</th><th>Eventos</th><th>Acumulado</th><th>Downtime</th><th>Costo directo</th></tr></thead><tbody>${failureRows || '<tr><td colspan="5">Sin fallas clasificadas en el filtro actual.</td></tr>'}</tbody></table><h3>Jack-Knife por modo de falla</h3>${chartImage("failureJackknife", "report-chart")}<table class="report-table"><thead><tr><th>Modo de falla</th><th>Fallas</th><th>MTTR JK</th><th>R*</th><th>Cuadrante</th></tr></thead><tbody>${modeRows || '<tr><td colspan="5">Sin modos de falla con reparaciones válidas.</td></tr>'}</tbody></table><h3>Acciones recomendadas</h3><ol>${priorities.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol><p class="report-limitations"><strong>Alcance y limitaciones.</strong> Los resultados dependen de la calidad del registro CMMS. El costo refleja campos directos disponibles; sin horas requeridas/operacionales no se estiman MTBF ni disponibilidad formal. El Jack-Knife se utiliza como priorización técnica relativa, no como riesgo formal de seguridad o económico.</p><div class="report-footer">Generado localmente en el navegador · ${escapeHtml(state.fileName)} · GMAO</div></section>`;
  }

  function exportReport() {
    if (!state.rows.length) return;
    if (!window.Chart) {
      showToast("Las gráficas aún se están cargando. Espera un momento y vuelve a intentarlo.", true);
      return;
    }
    const panels = [...document.querySelectorAll(".view-panel")];
    const wasHidden = panels.map((panel) => panel.hidden);
    panels.forEach((panel) => { panel.hidden = false; });
    const summary = summarize(state.rows);
    renderPanorama(state.rows, summary);
    renderAssets(state.rows);
    renderFailures(state.rows);
    panels.forEach((panel, index) => { panel.hidden = wasHidden[index]; });
    reportMarkup();
    showToast("En el diálogo de impresión, selecciona «Guardar como PDF».");
    window.setTimeout(() => window.print(), 120);
  }

  function initializeControls() {
    elements.uploadTrigger.addEventListener("click", () => elements.fileInput.click());
    elements.emptyUpload?.addEventListener("click", () => elements.fileInput.click());
    elements.fileInput.addEventListener("change", (event) => {
      loadFile(event.target.files?.[0]);
      event.target.value = "";
    });
    [elements.dateFrom, elements.dateTo, elements.areaFilter, elements.typeFilter, elements.criticalityFilter]
      .forEach((control) => control.addEventListener("change", applyFilters));
    elements.resetFilters.addEventListener("click", resetFilters);
    elements.pdfButton.addEventListener("click", exportReport);
    document.querySelectorAll(".nav-item[data-view]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
    window.addEventListener("afterprint", () => { elements.printReport.replaceChildren(); });

    window.addEventListener("dragenter", (event) => {
      event.preventDefault();
      state.dragDepth += 1;
      elements.dropOverlay.classList.add("is-visible");
    });
    window.addEventListener("dragover", (event) => event.preventDefault());
    window.addEventListener("dragleave", (event) => {
      event.preventDefault();
      state.dragDepth = Math.max(0, state.dragDepth - 1);
      if (!state.dragDepth) elements.dropOverlay.classList.remove("is-visible");
    });
    window.addEventListener("drop", (event) => {
      event.preventDefault();
      state.dragDepth = 0;
      elements.dropOverlay.classList.remove("is-visible");
      const file = [...(event.dataTransfer?.files ?? [])].find((item) => item.name.toLowerCase().endsWith(".csv"));
      if (file) loadFile(file);
      else showToast("Suelta un archivo CSV para cargar un dataset.", true);
    });
  }

  function loadDemo() {
    fetch("./data/CMMS_grupo_D.csv")
      .then((response) => {
        if (!response.ok) throw new Error("No hay dataset de demostración publicado.");
        setLoading("CMMS_grupo_D.csv");
        return response.text();
      })
      .then((text) => {
        const result = window.Papa.parse(text, { header: true, skipEmptyLines: "greedy", dynamicTyping: false, transformHeader: (header) => header.replace(/^\uFEFF/, "").trim() });
        const parsed = csvRows(result.data, "CMMS_grupo_D.csv");
        applyDataset(parsed.rows, parsed.headers, parsed.fileName, result.data.length - parsed.rows.length);
      })
      .catch(() => {
        elements.datasetStatus.classList.remove("is-loading");
        elements.datasetName.textContent = "Sin dataset";
        elements.emptyState.hidden = false;
        document.querySelector(".filter-bar").hidden = true;
        document.querySelector(".data-line").hidden = true;
        document.querySelector(".kpi-grid").hidden = true;
        elements.pdfButton.disabled = true;
        elements.recordSummary.textContent = "";
      });
  }

  function initializeIcons() {
    if (window.lucide?.createIcons) window.lucide.createIcons();
  }

  initializeIcons();
  initializeControls();
  loadDemo();
})();
