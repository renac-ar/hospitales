/**
 * app.js — DataViewer Hospitales RENAC
 * Single-file JS: data loading, charts, tables, and orchestration.
 */
(async function () {
    'use strict';

    let DATA = [], CATALOGO = [], METADATA = {}, HOSPS = {};
    let temporalChart = null, barrasChart = null, denomChart = null;

    // ═══ LOAD DATA ════════════════════════════════════════════════════
    try {
        const [csvText, cat, meta, hosps] = await Promise.all([
            fetch('data/prevalencia_hosp.csv').then(r => r.text()),
            fetch('data/anomalias_catalogo.json').then(r => r.json()),
            fetch('data/metadata.json').then(r => r.json()),
            fetch('data/hospitales_catalogo.json').then(r => r.json()),
        ]);
        DATA = Papa.parse(csvText, { header: true, dynamicTyping: true, skipEmptyLines: true }).data;
        CATALOGO = cat;
        METADATA = meta;
        HOSPS = hosps;

        console.log(`Loaded: ${DATA.length} rows, ${HOSPS.hospitales.length} hospitals`);
        init();
        document.getElementById('loading-overlay').classList.add('hidden');
    } catch (err) {
        console.error(err);
        document.getElementById('loading-overlay').innerHTML =
            `<p style="color:#C0504D;font-weight:600">Error al cargar datos</p><p style="font-size:.85rem;color:#666">${err.message}</p>`;
    }

    // ═══ HELPERS ══════════════════════════════════════════════════════
    function query(filters) {
        let r = DATA;
        if (filters.anomalia) r = r.filter(d => d.anomalia === filters.anomalia);
        if (filters.entity) r = r.filter(d => d.entity === filters.entity);
        if (filters.level) r = r.filter(d => d.level === filters.level);
        if (filters.anio != null) r = r.filter(d => d.anio === filters.anio);
        return r;
    }

    function getYears() {
        return [...new Set(DATA.map(d => d.anio))].filter(Boolean).sort((a, b) => a - b);
    }

    function getLabel(id) {
        for (const e of CATALOGO) {
            if (e.id === id) return e.label;
            if (e.children) for (const c of e.children) if (c.id === id) return c.label;
        }
        return id;
    }

    function hospName(id) {
        const h = HOSPS.hospitales.find(x => x.id === id);
        return h ? h.nombre : id;
    }

    function entityLabel(entity, level) {
        if (level === 'hospital') return hospName(entity);
        if (level === 'pais') return 'Argentina';
        // provincia
        const prov = HOSPS.provincias.find(p => p.id === entity);
        return prov ? prov.nombre : entity;
    }

    function downloadCSV(rows, filename) {
        if (!rows.length) return;
        const headers = Object.keys(rows[0]);
        const lines = [headers.join(','), ...rows.map(r => headers.map(h => {
            const v = r[h]; return typeof v === 'string' && v.includes(',') ? `"${v}"` : (v ?? '');
        }).join(','))];
        const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = filename; a.click();
    }

    // ═══ INIT ════════════════════════════════════════════════════════
    function init() {
        document.getElementById('header-meta').innerHTML =
            `Datos ${METADATA.rango_anios[0]}–${METADATA.rango_anios[1]}<br>${METADATA.total_hospitales} hospitales`;

        // Nav tabs
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
                document.getElementById('view-' + tab.dataset.view).classList.add('active');
            });
        });

        populateAnomalySelects();
        populateYearCheckboxes('filter-hosp-tabla-anios-container');
        populateYearCheckboxes('filter-hosp-barras-anios-container');
        setupTemporalView();
        setupTablaView();
        setupBarrasView();
        setupDenomView();
        setupMultiSelectDropdown('dropdown-hosp-tabla-anios', 'btn-hosp-tabla-anios', 'filter-hosp-tabla-anios-container', updateTabla, true);
        setupMultiSelectDropdown('dropdown-hosp-barras-anios', 'btn-hosp-barras-anios', 'filter-hosp-barras-anios-container', updateBarras, true);
    }

    // ═══ POPULATE SELECTS ════════════════════════════════════════════
    function populateAnomalySelects() {
        ['filter-anomalia', 'filter-barras-anomalia'].forEach(id => {
            const sel = document.getElementById(id);
            sel.innerHTML = '';
            for (const e of CATALOGO) {
                if (e.tipo === 'total') {
                    const o = document.createElement('option'); o.value = e.id;
                    o.textContent = `★ ${e.label}`; o.selected = true; sel.appendChild(o);
                } else if (e.tipo === 'group') {
                    const og = document.createElement('optgroup'); og.label = e.label;
                    const go = document.createElement('option'); go.value = e.id;
                    go.textContent = `${e.label} (grupo)`; og.appendChild(go);
                    if (e.children) e.children.forEach(c => {
                        const co = document.createElement('option'); co.value = c.id;
                        co.textContent = `  ${c.label}`; og.appendChild(co);
                    });
                    sel.appendChild(og);
                } else if (e.tipo === 'section' && e.children) {
                    const og = document.createElement('optgroup'); og.label = e.label;
                    e.children.forEach(c => {
                        const o = document.createElement('option'); o.value = c.id;
                        o.textContent = c.label; og.appendChild(o);
                    });
                    sel.appendChild(og);
                }
            }
        });
    }

    function populateYearCheckboxes(containerId) {
        const years = getYears();
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';
        const maxYear = Math.max(...years);
        for (let i = years.length - 1; i >= 0; i--) {
            const label = document.createElement('label');
            label.className = 'check-label';
            label.innerHTML = `<input type="checkbox" value="${years[i]}" ${years[i] === maxYear ? 'checked' : ''}> ${years[i]}`;
            container.appendChild(label);
        }
    }

    function getSelectedCheckboxes(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return [];
        return Array.from(container.querySelectorAll('input:not(.chk-select-all):checked')).map(cb => cb.value);
    }

    function setupMultiSelectDropdown(dropdownId, buttonId, containerId, onChangeCallback, showSelectAll = true) {
        const dropdown = document.getElementById(dropdownId);
        const btn = document.getElementById(buttonId);
        const container = document.getElementById(containerId);
        if (!dropdown || !btn || !container) return;

        let selectAllInput = null;
        if (showSelectAll) {
            const sal = document.createElement('label');
            sal.className = 'check-label select-all-label';
            sal.style.cssText = 'font-weight:600;border-bottom:1px solid #eee;padding-bottom:8px;margin-bottom:4px';
            sal.innerHTML = '<input type="checkbox" class="chk-select-all"> Seleccionar todos';
            container.insertBefore(sal, container.firstChild);
            selectAllInput = sal.querySelector('input');
        }
        const regularInputs = Array.from(container.querySelectorAll('input:not(.chk-select-all)'));
        if (showSelectAll) {
            selectAllInput.addEventListener('change', e => {
                regularInputs.forEach(inp => { inp.checked = e.target.checked; });
            });
        }
        btn.addEventListener('click', e => { e.stopPropagation(); container.classList.toggle('show'); });
        document.addEventListener('click', e => { if (!dropdown.contains(e.target)) container.classList.remove('show'); });
        container.addEventListener('change', e => {
            if (showSelectAll && e.target !== selectAllInput) {
                const all = regularInputs.every(i => i.checked);
                const some = regularInputs.some(i => i.checked);
                selectAllInput.checked = all;
                selectAllInput.indeterminate = some && !all;
            }
            const checked = regularInputs.filter(i => i.checked);
            if (checked.length === 0) btn.textContent = 'Ninguno seleccionado';
            else if (checked.length === 1) btn.textContent = checked[0].parentElement.textContent.trim();
            else if (checked.length === regularInputs.length) btn.textContent = 'Todos seleccionados';
            else btn.textContent = `${checked.length} seleccionados`;
            if (onChangeCallback) onChangeCallback();
        });
        setTimeout(() => {
            if (showSelectAll) {
                const all = regularInputs.every(i => i.checked);
                selectAllInput.checked = all;
                selectAllInput.indeterminate = regularInputs.some(i => i.checked) && !all;
            }
            container.dispatchEvent(new Event('change'));
        }, 0);
    }

    function poissonCI(k, n, factor) {
        if (!n || k == null) return { inf: null, sup: null };
        function normInv(p) {
            const a = [2.515517, 0.802853, 0.010328], b = [1.432788, 0.189269, 0.001308];
            const t = Math.sqrt(-2 * Math.log(p < 0.5 ? p : 1 - p));
            const z = t - (a[0] + t*(a[1] + t*a[2])) / (1 + t*(b[0] + t*(b[1] + t*b[2])));
            return p < 0.5 ? -z : z;
        }
        function chi2q(p, df) {
            if (df <= 0) return 0;
            const z = normInv(p);
            return df * Math.pow(Math.max(0, 1 - 2/(9*df) + z * Math.sqrt(2/(9*df))), 3);
        }
        const lo = k > 0 ? chi2q(0.025, 2*k) / 2 / n * factor : 0;
        const hi = chi2q(0.975, 2*(k+1)) / 2 / n * factor;
        return { inf: Math.max(0, lo).toFixed(2), sup: hi.toFixed(2) };
    }

    function populateEntitySelect(selectId, level, selectedProv) {
        const sel = document.getElementById(selectId); sel.innerHTML = '';
        if (level === 'pais') {
            const o = document.createElement('option'); o.value = 'ARGENTINA';
            o.textContent = 'Argentina'; sel.appendChild(o);
        } else if (level === 'provincia') {
            HOSPS.provincias.forEach(p => {
                const o = document.createElement('option'); o.value = p.id;
                o.textContent = p.nombre; sel.appendChild(o);
            });
        } else {
            // Hospitals grouped by province
            const provs = Object.keys(HOSPS.por_provincia).sort();
            provs.forEach(prov => {
                const og = document.createElement('optgroup');
                const pn = HOSPS.provincias.find(p => p.id === prov);
                og.label = pn ? pn.nombre : prov;
                HOSPS.por_provincia[prov].forEach(h => {
                    const o = document.createElement('option'); o.value = h.id;
                    o.textContent = h.nombre; og.appendChild(o);
                });
                sel.appendChild(og);
            });
        }
    }

    function populateProvSelect(selectId) {
        const sel = document.getElementById(selectId); sel.innerHTML = '';
        const all = document.createElement('option'); all.value = '__ALL__';
        all.textContent = 'Todas las provincias'; sel.appendChild(all);
        HOSPS.provincias.forEach(p => {
            const o = document.createElement('option'); o.value = p.id;
            o.textContent = p.nombre; sel.appendChild(o);
        });
    }

    // ═══ VIEW 1: TEMPORAL ════════════════════════════════════════════
    function setupTemporalView() {
        const levelSel = document.getElementById('filter-level');
        const entitySel = document.getElementById('filter-entity');
        const entityGrp = document.getElementById('fg-entity');

        function onLevelChange() {
            const level = levelSel.value;
            document.querySelector('#fg-entity label').textContent =
                level === 'hospital' ? 'Hospital' : level === 'provincia' ? 'Provincia' : 'País';
            entityGrp.style.display = level === 'pais' ? 'none' : '';
            populateEntitySelect('filter-entity', level);
            updateTemporal();
        }

        levelSel.addEventListener('change', onLevelChange);
        entitySel.addEventListener('change', updateTemporal);
        document.getElementById('filter-anomalia').addEventListener('change', updateTemporal);
        onLevelChange();

        document.getElementById('btn-chart').addEventListener('click', () => {
            document.getElementById('btn-chart').classList.add('active');
            document.getElementById('btn-table').classList.remove('active');
            document.getElementById('temporal-chart-container').style.display = '';
            document.getElementById('temporal-table-container').style.display = 'none';
        });
        document.getElementById('btn-table').addEventListener('click', () => {
            document.getElementById('btn-table').classList.add('active');
            document.getElementById('btn-chart').classList.remove('active');
            document.getElementById('temporal-chart-container').style.display = 'none';
            document.getElementById('temporal-table-container').style.display = '';
        });
        document.getElementById('btn-download-temporal').addEventListener('click', () => {
            const d = getTemporalData();
            downloadCSV(d, `renac_hosp_temporal.csv`);
        });
    }

    function getTemporalData() {
        const anom = document.getElementById('filter-anomalia').value;
        const level = document.getElementById('filter-level').value;
        const entity = level === 'pais' ? 'ARGENTINA' : document.getElementById('filter-entity').value;
        return query({ anomalia: anom, entity, level });
    }

    function updateTemporal() {
        const data = getTemporalData().sort((a, b) => a.anio - b.anio);
        const anom = document.getElementById('filter-anomalia').value;
        const level = document.getElementById('filter-level').value;
        const entity = level === 'pais' ? 'ARGENTINA' : document.getElementById('filter-entity').value;

        document.getElementById('temporal-title').textContent =
            `${getLabel(anom)} — ${entityLabel(entity, level)}`;

        const factor = data.length > 0 ? data[0].factor : 10000;
        document.getElementById('temporal-footnote').textContent =
            `Prevalencia ${factor === 100 ? 'por 100' : 'por 10.000'} nacimientos. IC 95% Poisson exacto.`;

        // Chart
        const ctx = document.getElementById('temporal-chart').getContext('2d');
        if (temporalChart) temporalChart.destroy();
        temporalChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.map(d => d.anio),
                datasets: [{
                    label: 'Prevalencia', data: data.map(d => d.prev || 0),
                    borderColor: '#1E5596', backgroundColor: 'rgba(30,85,150,0.08)',
                    borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: '#1E5596',
                    fill: true, tension: 0.15,
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(15,45,82,0.95)',
                        titleFont: { family: "'Inter'", size: 13 },
                        bodyFont: { family: "'Inter'", size: 12 },
                        padding: 12, cornerRadius: 6,
                        callbacks: {
                            title: items => `Año ${items[0].label}`,
                            label: item => {
                                const r = data[item.dataIndex];
                                const fl = factor === 100 ? '×100' : '×10k';
                                return [
                                    `  Prev: ${r.prev} ${fl}`,
                                    `  Casos: ${r.casos_total}  |  Nac: ${(r.nacimientos||0).toLocaleString('es')}`,
                                    r.ic_inf && r.ic_sup ? `  IC 95%: ${r.ic_inf}–${r.ic_sup}` : '',
                                ].filter(Boolean);
                            },
                        },
                    },
                },
                scales: {
                    x: { grid: { display: false }, ticks: { font: { family: "'Inter'" } } },
                    y: {
                        beginAtZero: false,
                        grid: { color: 'rgba(0,0,0,0.05)' },
                        title: { display: true, text: `Prevalencia ${factor === 100 ? '×100' : '×10k'}`, font: { family: "'Inter'", size: 12 } },
                    },
                },
            },
        });

        // Table
        const thead = document.querySelector('#temporal-table thead');
        const tbody = document.querySelector('#temporal-table tbody');
        const fl = factor === 100 ? '×100' : '×10k';
        thead.innerHTML = `<tr><th>Año</th><th class="num">Nac.</th><th class="num">Casos</th><th class="num">NV</th><th class="num">FM</th><th class="num">ILE</th><th class="num">NE</th><th class="num">Prev ${fl}</th><th class="num">IC 95%</th></tr>`;
        tbody.innerHTML = [...data].sort((a, b) => b.anio - a.anio).map(r => `<tr>
            <td>${r.anio}</td><td class="num">${(r.nacimientos||0).toLocaleString('es')}</td>
            <td class="num">${r.casos_total||0}</td><td class="num">${r.casos_nv||0}</td>
            <td class="num">${r.casos_fm||0}</td><td class="num">${r.casos_ile||0}</td>
            <td class="num">${r.casos_ne||0}</td><td class="num"><strong>${r.prev||'—'}</strong></td>
            <td class="num">${r.ic_inf&&r.ic_sup?`(${r.ic_inf}–${r.ic_sup})`:'—'}</td>
        </tr>`).join('');
    }

    // ═══ VIEW 2: TABLA PREVALENCIA ═══════════════════════════════════
    function setupTablaView() {
        const levelSel = document.getElementById('filter-tabla-level');
        function onLevelChange() {
            const level = levelSel.value;
            document.querySelector('#fg-tabla-entity label').textContent =
                level === 'hospital' ? 'Hospital' : level === 'provincia' ? 'Provincia' : 'País';
            document.getElementById('fg-tabla-entity').style.display = level === 'pais' ? 'none' : '';
            populateEntitySelect('filter-tabla-entity', level);
            updateTabla();
        }
        levelSel.addEventListener('change', onLevelChange);
        document.getElementById('filter-tabla-entity').addEventListener('change', updateTabla);
        onLevelChange();

        document.getElementById('btn-download-tabla').addEventListener('click', () => {
            const level = document.getElementById('filter-tabla-level').value;
            const entity = level === 'pais' ? 'ARGENTINA' : document.getElementById('filter-tabla-entity').value;
            const years = getSelectedCheckboxes('filter-hosp-tabla-anios-container').map(Number);
            const rows = DATA.filter(r => r.entity === entity && r.level === level && years.includes(r.anio));
            downloadCSV(rows, `renac_hosp_tabla_${entity}.csv`);
        });
    }

    function updateTabla() {
        const level = document.getElementById('filter-tabla-level').value;
        const entity = level === 'pais' ? 'ARGENTINA' : document.getElementById('filter-tabla-entity').value;
        const selectedYears = getSelectedCheckboxes('filter-hosp-tabla-anios-container').map(Number);
        if (!selectedYears.length) return;
        const isMultiYear = selectedYears.length > 1;
        const yearLabel = isMultiYear ? `${Math.min(...selectedYears)}–${Math.max(...selectedYears)}` : selectedYears[0];

        document.getElementById('tabla-title').textContent =
            `Prevalencia — ${entityLabel(entity, level)} — ${yearLabel}`;

        // Aggregate nacimientos across selected years
        const hlpRows = DATA.filter(r => r.anomalia === 'hlptrue' && r.entity === entity && r.level === level && selectedYears.includes(r.anio));
        const totalNac = hlpRows.reduce((s, r) => s + (r.nacimientos || 0), 0);
        document.getElementById('tabla-footnote').textContent =
            `Nacimientos${isMultiYear ? ' acumulados' : ''}: ${totalNac.toLocaleString('es')}. Prevalencia por 10.000 (excepto Total AC: por 100). IC 95% Poisson exacto.`;

        const thead = document.querySelector('#prevalencia-table thead');
        const tbody = document.querySelector('#prevalencia-table tbody');
        thead.innerHTML = `<tr><th style="min-width:260px">Anomalía</th><th class="num">Casos</th><th class="num">NV</th><th class="num">FM</th><th class="num">ILE</th><th class="num">NE</th><th class="num">Prev</th><th class="num">IC 95%</th></tr>`;

        function findRow(anom) {
            const rows = DATA.filter(r => r.anomalia === anom && r.entity === entity && r.level === level && selectedYears.includes(r.anio));
            if (!rows.length) return null;
            if (rows.length === 1) return rows[0];
            const casos_total = rows.reduce((s, r) => s + (r.casos_total || 0), 0);
            const casos_nv    = rows.reduce((s, r) => s + (r.casos_nv    || 0), 0);
            const casos_fm    = rows.reduce((s, r) => s + (r.casos_fm    || 0), 0);
            const casos_ile   = rows.reduce((s, r) => s + (r.casos_ile   || 0), 0);
            const casos_ne    = rows.reduce((s, r) => s + (r.casos_ne    || 0), 0);
            const nacimientos = rows.reduce((s, r) => s + (r.nacimientos || 0), 0);
            const factor = rows[0].factor || 10000;
            const prev = nacimientos > 0 ? Math.round(casos_total / nacimientos * factor * 100) / 100 : null;
            const ci = poissonCI(casos_total, nacimientos, factor);
            return { casos_total, casos_nv, casos_fm, casos_ile, casos_ne, nacimientos, factor, prev, ic_inf: ci.inf, ic_sup: ci.sup };
        }
        function fmtRow(r) {
            if (!r) return '<td class="num">—</td>'.repeat(7);
            return `<td class="num">${r.casos_total||0}</td><td class="num">${r.casos_nv||0}</td><td class="num">${r.casos_fm||0}</td><td class="num">${r.casos_ile||0}</td><td class="num">${r.casos_ne||0}</td><td class="num"><strong>${r.prev!=null&&r.prev!==''?r.prev:'—'}</strong></td><td class="num">${r.ic_inf&&r.ic_sup?`(${r.ic_inf}–${r.ic_sup})`:'—'}</td>`;
        }

        let html = '';
        for (const e of CATALOGO) {
            if (e.tipo === 'total') {
                html += `<tr class="row-total"><td>${e.label}</td>${fmtRow(findRow(e.id))}</tr>`;
            } else if (e.tipo === 'group') {
                html += `<tr class="row-group" data-group="${e.id}"><td>${e.label}</td>${fmtRow(findRow(e.id))}</tr>`;
                if (e.children) e.children.forEach(c => {
                    html += `<tr class="row-child child-of-${e.id}"><td>${c.label}</td>${fmtRow(findRow(c.id))}</tr>`;
                });
            } else if (e.tipo === 'section') {
                html += `<tr class="row-section"><td colspan="8">${e.label}</td></tr>`;
                if (e.children) e.children.forEach(c => {
                    html += `<tr class="row-child"><td>${c.label}</td>${fmtRow(findRow(c.id))}</tr>`;
                });
            }
        }
        tbody.innerHTML = html;
        tbody.querySelectorAll('.row-group').forEach(row => {
            row.addEventListener('click', () => {
                const gid = row.dataset.group;
                const collapsed = row.classList.toggle('collapsed');
                tbody.querySelectorAll(`.child-of-${gid}`).forEach(c => c.classList.toggle('hidden', collapsed));
            });
        });
    }

    // ═══ VIEW 3: COMPARACIÓN ═════════════════════════════════════════
    function setupBarrasView() {
        const levelSel = document.getElementById('filter-barras-level');
        const provGrp = document.getElementById('fg-barras-prov');

        populateProvSelect('filter-barras-prov');

        function onLevelChange() {
            provGrp.style.display = levelSel.value === 'hospital' ? '' : 'none';
            updateBarras();
        }
        levelSel.addEventListener('change', onLevelChange);
        document.getElementById('filter-barras-anomalia').addEventListener('change', updateBarras);
        document.getElementById('filter-barras-prov').addEventListener('change', updateBarras);
        onLevelChange();

        document.getElementById('btn-download-barras').addEventListener('click', () => {
            const d = getBarrasData();
            downloadCSV(d, 'renac_hosp_comparacion.csv');
        });
    }

    function getBarrasData() {
        const anom = document.getElementById('filter-barras-anomalia').value;
        const selectedYears = getSelectedCheckboxes('filter-hosp-barras-anios-container').map(Number);
        const level = document.getElementById('filter-barras-level').value;

        let rows = DATA.filter(r => r.anomalia === anom && selectedYears.includes(r.anio) && r.level === level);

        if (level === 'hospital') {
            const prov = document.getElementById('filter-barras-prov').value;
            if (prov !== '__ALL__') {
                const provHosps = new Set((HOSPS.por_provincia[prov] || []).map(h => h.id));
                rows = rows.filter(d => provHosps.has(d.entity));
            }
        }
        if (selectedYears.length <= 1) return rows;

        // Aggregate across years per entity
        const byEntity = {};
        rows.forEach(r => {
            if (!byEntity[r.entity]) byEntity[r.entity] = { casos: 0, nacimientos: 0, factor: r.factor || 10000, entity: r.entity, level: r.level, anomalia: r.anomalia };
            byEntity[r.entity].casos      += r.casos_total || 0;
            byEntity[r.entity].nacimientos += r.nacimientos || 0;
        });
        return Object.values(byEntity).map(e => {
            const prev = e.nacimientos > 0 ? Math.round(e.casos / e.nacimientos * e.factor * 100) / 100 : null;
            const ci = poissonCI(e.casos, e.nacimientos, e.factor);
            return { ...e, casos_total: e.casos, prev, ic_inf: ci.inf, ic_sup: ci.sup };
        });
    }

    function updateBarras() {
        const anom = document.getElementById('filter-barras-anomalia').value;
        const selectedYears = getSelectedCheckboxes('filter-hosp-barras-anios-container').map(Number);
        const level = document.getElementById('filter-barras-level').value;
        const data = getBarrasData().filter(d => d.prev != null && d.prev !== '' && d.prev > 0)
            .sort((a, b) => (b.prev || 0) - (a.prev || 0));

        // Argentina reference: aggregate across selected years
        const argRows = DATA.filter(d => d.anomalia === anom && selectedYears.includes(d.anio) && d.level === 'pais');
        let argPrev = null;
        if (argRows.length) {
            const argCasos = argRows.reduce((s, r) => s + (r.casos_total || 0), 0);
            const argNac   = argRows.reduce((s, r) => s + (r.nacimientos || 0), 0);
            const factor0  = argRows[0].factor || 10000;
            argPrev = argNac > 0 ? Math.round(argCasos / argNac * factor0 * 100) / 100 : null;
        }
        const factor = data.length > 0 ? data[0].factor : 10000;
        const fl = factor === 100 ? '×100' : '×10k';
        const yearLabel = selectedYears.length === 1 ? selectedYears[0] : `${Math.min(...selectedYears)}–${Math.max(...selectedYears)}`;
        const levelLabel = level === 'hospital' ? 'hospitales' : 'provincias';
        document.getElementById('barras-title').textContent = `${getLabel(anom)} — ${levelLabel} — ${yearLabel}`;
        document.getElementById('barras-footnote').textContent =
            `Prevalencia ${fl} nac. Línea punteada: Argentina. IC 95% Poisson exacto.`;

        // Dynamic height
        const container = document.getElementById('barras-chart-container');
        container.style.height = Math.max(400, data.length * 28 + 60) + 'px';

        const labels = data.map(d => level === 'hospital' ? hospName(d.entity) : entityLabel(d.entity, level));
        const values = data.map(d => d.prev || 0);
        const bgColors = values.map(v => argPrev && v > argPrev ? 'rgba(192,80,77,0.65)' : 'rgba(46,117,182,0.65)');
        const borderColors = values.map(v => argPrev && v > argPrev ? '#C0504D' : '#2E75B6');

        const ctx = document.getElementById('barras-chart').getContext('2d');
        if (barrasChart) barrasChart.destroy();

        barrasChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{ data: values, backgroundColor: bgColors, borderColor: borderColors, borderWidth: 1, borderRadius: 3, barPercentage: 0.7 }]
            },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(15,45,82,0.95)',
                        callbacks: {
                            label: item => {
                                const r = data[item.dataIndex];
                                return [`  Prev: ${r.prev} ${fl}`, `  Casos: ${r.casos_total} | Nac: ${(r.nacimientos||0).toLocaleString('es')}`,
                                    r.ic_inf&&r.ic_sup?`  IC 95%: ${r.ic_inf}–${r.ic_sup}`:''].filter(Boolean);
                            }
                        }
                    }
                },
                scales: {
                    x: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' },
                        title: { display: true, text: `Prevalencia ${fl}` } },
                    y: { grid: { display: false }, ticks: { font: { family: "'Inter'", size: 11 } } },
                },
            },
            plugins: [{
                id: 'argLine',
                afterDraw: chart => {
                    if (!argPrev) return;
                    const { ctx: c, scales: { x } } = chart;
                    const px = x.getPixelForValue(argPrev);
                    c.save(); c.beginPath(); c.setLineDash([6, 4]);
                    c.strokeStyle = '#1E5596'; c.lineWidth = 2;
                    c.moveTo(px, chart.chartArea.top); c.lineTo(px, chart.chartArea.bottom);
                    c.stroke(); c.setLineDash([]);
                    c.fillStyle = '#1E5596'; c.font = "bold 11px 'Inter'"; c.textAlign = 'center';
                    c.fillText(`Arg: ${argPrev}`, px, chart.chartArea.top - 6);
                    c.restore();
                }
            }]
        });
    }

    // ═══ VIEW 4: DENOMINADORES ═══════════════════════════════════════════

    function setupDenomView() {
        const levelSel = document.getElementById('filter-denom-level');
        const entitySel = document.getElementById('filter-denom-entity');
        const entityGrp = document.getElementById('fg-denom-entity');

        function onLevelChange() {
            const level = levelSel.value;
            document.querySelector('#fg-denom-entity label').textContent =
                level === 'hospital' ? 'Hospital' : level === 'provincia' ? 'Provincia' : 'País';
            entityGrp.style.display = level === 'pais' ? 'none' : '';
            populateEntitySelect('filter-denom-entity', level);
            updateDenom();
        }

        levelSel.addEventListener('change', onLevelChange);
        entitySel.addEventListener('change', updateDenom);
        onLevelChange();

        // Toggle chart/table
        document.getElementById('btn-denom-chart').addEventListener('click', () => {
            document.getElementById('btn-denom-chart').classList.add('active');
            document.getElementById('btn-denom-table').classList.remove('active');
            document.getElementById('denom-chart-container').style.display = '';
            document.getElementById('denom-table-container').style.display = 'none';
        });
        document.getElementById('btn-denom-table').addEventListener('click', () => {
            document.getElementById('btn-denom-table').classList.add('active');
            document.getElementById('btn-denom-chart').classList.remove('active');
            document.getElementById('denom-chart-container').style.display = 'none';
            document.getElementById('denom-table-container').style.display = '';
        });

        // Download
        document.getElementById('btn-download-denom').addEventListener('click', () => {
            const d = getDenomData();
            downloadCSV(d, 'renac_hosp_nacimientos.csv');
        });
    }

    function getDenomData() {
        const level = document.getElementById('filter-denom-level').value;
        const entity = level === 'pais' ? 'ARGENTINA' : document.getElementById('filter-denom-entity').value;
        return DATA.filter(r => r.anomalia === 'hlptrue' && r.entity === entity && r.level === level)
            .map(r => ({ anio: r.anio, entity: r.entity, level: r.level, nacimientos: r.nacimientos }))
            .sort((a, b) => a.anio - b.anio);
    }

    function updateDenom() {
        const level = document.getElementById('filter-denom-level').value;
        const entity = level === 'pais' ? 'ARGENTINA' : document.getElementById('filter-denom-entity').value;
        const data = getDenomData();
        const label = entityLabel(entity, level);

        document.getElementById('denom-title').textContent = `Nacimientos por año — ${label}`;

        const totalNac = data.reduce((s, r) => s + (r.nacimientos || 0), 0);
        document.getElementById('denom-footnote').textContent =
            `Total acumulado: ${totalNac.toLocaleString('es')} nacimientos (${data.length} años). Nacimientos en hospitales RENAC.`;

        // Chart
        const ctx = document.getElementById('denom-chart').getContext('2d');
        if (denomChart) denomChart.destroy();

        const gradient = ctx.createLinearGradient(0, 0, 0, 380);
        gradient.addColorStop(0, 'rgba(30, 85, 150, 0.7)');
        gradient.addColorStop(1, 'rgba(30, 85, 150, 0.25)');

        denomChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.map(d => d.anio),
                datasets: [{
                    label: 'Nacimientos', data: data.map(d => d.nacimientos || 0),
                    backgroundColor: gradient, borderColor: '#1E5596',
                    borderWidth: 1.5, borderRadius: 4, barPercentage: 0.7,
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(15,45,82,0.95)',
                        callbacks: {
                            title: items => `Año ${items[0].label}`,
                            label: item => `  Nacimientos: ${item.raw.toLocaleString('es')}`,
                        }
                    },
                },
                scales: {
                    x: { grid: { display: false }, ticks: { font: { family: "'Inter'" } } },
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(0,0,0,0.05)' },
                        ticks: { font: { family: "'Inter'" }, callback: v => v.toLocaleString('es') },
                        title: { display: true, text: 'Nacimientos', font: { family: "'Inter'", size: 12 } },
                    },
                },
            },
        });

        // Table
        const thead = document.querySelector('#denom-table thead');
        const tbody = document.querySelector('#denom-table tbody');
        thead.innerHTML = `<tr><th>Año</th><th class="num">Nacimientos</th></tr>`;
        tbody.innerHTML = [...data].sort((a, b) => b.anio - a.anio).map(r => `<tr>
            <td>${r.anio}</td><td class="num"><strong>${(r.nacimientos||0).toLocaleString('es')}</strong></td>
        </tr>`).join('');
    }

})();
