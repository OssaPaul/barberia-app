// Archivo: app.js (Versión Multi-Barbería)

document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('authToken');
    const barberiaId = localStorage.getItem('barberia_id');

    // Se verifica tanto el token como el ID de la barbería.
    if (!token || !barberiaId) {
        window.location.href = 'index.html';
        return;
    }

    const parseJwt = (token) => {
        try {
            return JSON.parse(atob(token.split('.')[1]));
        } catch (e) {
            return null;
        }
    };

    const decodedToken = parseJwt(token);
    const userRole = decodedToken ? decodedToken.rol : null;

    if (!userRole) {
        // Limpieza completa si el token es inválido.
        localStorage.removeItem('authToken');
        localStorage.removeItem('barberia_id');
        localStorage.removeItem('barberia_nombre');
        localStorage.removeItem('barberia_logo');
        localStorage.removeItem('theme');
        window.location.href = 'index.html';
        return;
    }

    const applyRolePermissions = (role) => {
        if (role !== 'administrador') {
            document.querySelectorAll('.admin-only').forEach(el => {
                el.style.display = 'none';
            });
        }
    };

    const loadBarberiaConfig = async () => {
        try {
            // Se usa fetchData para enviar el token automáticamente.
            const config = await fetchData('/api/configuracion');
            if (!config) throw new Error('No se pudo cargar la configuración.');

            const sidebarLogo = document.getElementById('sidebar-logo');
            const sidebarTitle = document.getElementById('sidebar-title');

            if (config.logoUrl && sidebarLogo) sidebarLogo.src = config.logoUrl;
            if (config.nombre && sidebarTitle) {
                sidebarTitle.textContent = config.nombre;
                document.title = `${config.nombre} - Dashboard`;
            }
        } catch (error) {
            console.error('Error al cargar configuración:', error);
            const sidebarTitle = document.getElementById('sidebar-title');
            if (sidebarTitle) sidebarTitle.textContent = "Error de Config.";
        }
    };

    const views = {
        dashboard: document.getElementById('view-dashboard'),
        citas: document.getElementById('view-citas'),
        inventory: document.getElementById('view-inventory'),
        clients: document.getElementById('view-clients'),
        'client-detail': document.getElementById('view-client-detail'),
        barbers: document.getElementById('view-barbers'),
        services: document.getElementById('view-services'),
        reports: document.getElementById('view-reports'),
    };
    const navLinks = {
        dashboard: document.getElementById('nav-dashboard').parentElement,
        citas: document.getElementById('nav-citas').parentElement,
        inventory: document.getElementById('nav-inventory').parentElement,
        clients: document.getElementById('nav-clients').parentElement,
        barbers: document.getElementById('nav-barbers').parentElement,
        services: document.getElementById('nav-services').parentElement,
        reports: document.getElementById('nav-reports').parentElement,
    };
    const showView = (viewName) => {
        if (userRole === 'cliente' && viewName !== 'citas') {
            viewName = 'citas';
        }

        let mainView = viewName.split('-')[0];
        Object.values(views).forEach(view => { if (view) view.style.display = 'none'; });
        Object.values(navLinks).forEach(link => { if (link) link.classList.remove('active'); });
        if (views[viewName]) views[viewName].style.display = 'block';
        if (navLinks[mainView]) navLinks[mainView].classList.add('active');
    };

    const fetchData = async (endpoint, method = 'GET', body = null) => {
        const headers = { 'Authorization': `Bearer ${token}` };
        const config = { method, headers };
        if (body instanceof FormData) {
            config.body = body;
        } else if (body) {
            config.body = JSON.stringify(body);
            headers['Content-Type'] = 'application/json';
        }
        try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
            if (response.status === 401 || response.status === 403) {
                 logout();
                 return null;
            }
            if (!response.ok) {
                const responseData = await response.json();
                alert(`Error: ${responseData.message || 'Ocurrió un problema.'}`);
                return null;
            }
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") !== -1) {
                return response.json();
            }
            return response.text();
        } catch (error) {
            console.error(`Error en fetchData para ${endpoint}:`, error);
            alert('Error de conexión con el servidor.');
            return null;
        }
    };

    const modalOverlay = document.getElementById('modal-overlay');
    const openModal = (modalId) => {
        const modal = document.getElementById(modalId);
        if (modal) modal.style.display = 'block';
        if (modalOverlay) modalOverlay.style.display = 'block';
    };
    const closeModal = () => {
        document.querySelectorAll('.modal').forEach(modal => modal.style.display = 'none');
        if (modalOverlay) modalOverlay.style.display = 'none';
    };

    let currentClientId = null;
    let calendar = null;
    let isCalendarInitialized = false;

    const formatCurrency = (value) => (value || 0).toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 });

    const cargarKPIs = async () => { const data = await fetchData('/api/dashboard/kpis'); if (data) { document.getElementById('kpi-ingresos').textContent = formatCurrency(parseFloat(data.ingresos)); document.getElementById('kpi-gastos').textContent = formatCurrency(parseFloat(data.gastos)); document.getElementById('kpi-utilidad').textContent = formatCurrency(parseFloat(data.utilidad)); document.getElementById('kpi-citas').textContent = data.citas; } };
    
    const cargarDashboardSummary = async () => {
        const data = await fetchData('/api/dashboard/summary');
        
        const barberiaList = document.getElementById('summary-ingresos-barberia-lista');
        const barberosList = document.getElementById('summary-ingresos-barberos-lista');

        const semanaTotalBarberia = document.getElementById('summary-ingresos-semana-barberia');
        const semanaTotalBarberos = document.getElementById('summary-ingresos-semana-barberos');
        const mesTotalBarberia = document.getElementById('summary-ingresos-mes-barberia');
        const mesTotalBarberos = document.getElementById('summary-ingresos-mes-barberos');
        
        const gastosSemanaEl = document.getElementById('summary-gastos-semana');
        const gastosMesEl = document.getElementById('summary-gastos-mes');

        if (data && barberiaList && barberosList) {
            barberiaList.innerHTML = '';
            barberosList.innerHTML = '';

            let totalSemanaBarberia = 0;
            let totalSemanaBarberos = 0;

            data.semana.labels.forEach((label, index) => {
                const ingresoBarberia = data.semana.ingresosBarberia[index] || 0;
                totalSemanaBarberia += ingresoBarberia;
                const barberiaLi = document.createElement('li');
                barberiaLi.innerHTML = `<span>${label}</span> <span>${formatCurrency(ingresoBarberia)}</span>`;
                barberiaList.appendChild(barberiaLi);

                const ingresoBarberos = data.semana.ingresosBarberos[index] || 0;
                totalSemanaBarberos += ingresoBarberos;
                const barberosLi = document.createElement('li');
                barberosLi.innerHTML = `<span>${label}</span> <span>${formatCurrency(ingresoBarberos)}</span>`;
                barberosList.appendChild(barberosLi);
            });

            semanaTotalBarberia.textContent = `TOTALES SEMANA: ${formatCurrency(totalSemanaBarberia)}`;
            semanaTotalBarberos.textContent = `TOTALES SEMANA: ${formatCurrency(totalSemanaBarberos)}`;

            mesTotalBarberia.textContent = `TOTALES MES: ${formatCurrency(data.mes.totalIngresosBarberia)}`;
            mesTotalBarberos.textContent = `TOTALES MES: ${formatCurrency(data.mes.totalIngresosBarberos)}`;
            
            const totalGastosSemana = data.semana.gastos.reduce((acc, curr) => acc + curr, 0);
            gastosSemanaEl.textContent = `Gastos Semana: ${formatCurrency(totalGastosSemana)}`;
            gastosMesEl.textContent = `Gastos Mes: ${formatCurrency(data.mes.totalGastos)}`;

        } else {
             if(barberiaList) barberiaList.innerHTML = '<li>No se pudo cargar la información.</li>';
             if(barberosList) barberosList.innerHTML = '<li>No se pudo cargar la información.</li>';
        }
    };

    const cargarAlertaStock = async () => { const data = await fetchData('/api/productos/bajo-stock'); const lowStockList = document.getElementById('low-stock-list'); if (!lowStockList) return; lowStockList.innerHTML = ''; if (data && data.length > 0) { data.forEach(producto => { const li = document.createElement('li'); li.innerHTML = `<span>${producto.nombre}</span> <span>(${producto.stock_actual} restantes)</span>`; lowStockList.appendChild(li); }); } else { lowStockList.innerHTML = '<li><span>No hay productos con bajo stock.</span></li>'; } };
    const cargarProductosEnSelect = async (selectId) => { const productos = await fetchData('/api/productos'); const selectElement = document.getElementById(selectId); if (productos && selectElement) { selectElement.innerHTML = '<option value="">-- Selecciona un producto --</option>'; productos.forEach(producto => { const option = document.createElement('option'); option.value = producto.producto_id; option.textContent = `${producto.nombre} (Stock: ${producto.stock_actual})`; selectElement.appendChild(option); }); } };
    const cargarInventario = async () => { const productos = await fetchData('/api/productos'); const inventoryBody = document.getElementById('inventory-body'); if (!inventoryBody) return; inventoryBody.innerHTML = '<tr><td colspan="6">Cargando...</td></tr>'; if (productos && productos.length > 0) { inventoryBody.innerHTML = ''; productos.forEach(p => { const row = document.createElement('tr'); const totalValue = formatCurrency(p.stock_actual * p.precio_venta); const stockClass = p.stock_actual <= p.stock_minimo ? 'stock-low' : 'stock-ok'; row.innerHTML = `<td>${p.nombre}</td><td class="${stockClass}">${p.stock_actual}</td><td>${p.stock_minimo}</td><td>${formatCurrency(parseFloat(p.precio_venta))}</td><td>${formatCurrency(parseFloat(p.costo_compra))}</td><td>${totalValue}</td>`; inventoryBody.appendChild(row); }); } else { inventoryBody.innerHTML = '<tr><td colspan="6">No hay productos en el inventario.</td></tr>'; } };
    const cargarClientes = async () => { const clientes = await fetchData('/api/clientes'); const clientsBody = document.getElementById('clients-body'); if (!clientsBody) return; clientsBody.innerHTML = '<tr><td colspan="4">Cargando...</td></tr>'; if (clientes && clientes.length > 0) { clientsBody.innerHTML = ''; clientes.forEach(c => { const row = document.createElement('tr'); row.innerHTML = `<td>${c.nombre} ${c.apellido}</td><td>${c.telefono}</td><td>${c.email || 'N/A'}</td><td><button class="btn-icon" onclick="verCliente(${c.cliente_id})"><i class="fas fa-eye"></i></button><button class="btn-icon" onclick="editarCliente(${c.cliente_id})"><i class="fas fa-edit"></i></button></td>`; clientsBody.appendChild(row); }); } else { clientsBody.innerHTML = '<tr><td colspan="4">No hay clientes registrados.</td></tr>'; } };
    window.verCliente = async (id) => { currentClientId = id; const cliente = await fetchData(`/api/clientes/${id}/completo`); if (cliente) { document.getElementById('client-detail-name').textContent = `${cliente.nombre} ${cliente.apellido}`; document.getElementById('client-detail-info').innerHTML = `<p><strong>Teléfono:</strong> ${cliente.telefono}</p><p><strong>Email:</strong> ${cliente.email || 'N/A'}</p><p><strong>Nacimiento:</strong> ${cliente.fecha_nacimiento || 'N/A'}</p><p><strong>Notas:</strong></p><p>${cliente.notas || 'No hay notas.'}</p>`; const citasUl = document.getElementById('client-detail-citas'); citasUl.innerHTML = ''; if (cliente.Citas && cliente.Citas.length > 0) { cliente.Citas.forEach(cita => { const li = document.createElement('li'); const fecha = new Date(cita.fecha_hora_inicio).toLocaleString('es-CO'); li.textContent = `${fecha} - ${cita.Servicios.map(s=>s.nombre).join(', ')} con ${cita.Barbero.nombre}`; citasUl.appendChild(li); }); } else { citasUl.innerHTML = '<li>No hay historial de citas.</li>'; } document.getElementById('btn-edit-client-from-detail').onclick = () => editarCliente(id); document.getElementById('foto-antes-img').src = cliente.foto_antes_url ? cliente.foto_antes_url : 'placeholder.png'; document.getElementById('foto-despues-img').src = cliente.foto_despues_url ? cliente.foto_despues_url : 'placeholder.png'; showView('client-detail'); } };
    window.editarCliente = async (id) => { const cliente = await fetchData(`/api/clientes/${id}/completo`); if(cliente){ document.getElementById('modal-cliente-titulo').textContent = 'Editar Cliente'; document.getElementById('cliente-id').value = cliente.cliente_id; document.getElementById('cliente-nombre').value = cliente.nombre; document.getElementById('cliente-apellido').value = cliente.apellido; document.getElementById('cliente-telefono').value = cliente.telefono; document.getElementById('cliente-email').value = cliente.email || ''; document.getElementById('cliente-fecha-nacimiento').value = cliente.fecha_nacimiento || ''; document.getElementById('cliente-notas').value = cliente.notas || ''; openModal('modal-cliente'); } };
    const cargarBarberos = async () => { const barbersBody = document.getElementById('barbers-body'); if (!barbersBody) return; barbersBody.innerHTML = '<tr><td colspan="5">Cargando...</td></tr>'; const barberos = await fetchData('/api/barberos'); if (barberos && barberos.length > 0) { barbersBody.innerHTML = ''; barberos.forEach(b => { const row = document.createElement('tr'); const fotoUrl = b.foto_url ? b.foto_url : 'placeholder.png'; row.innerHTML = `<td><img src="${fotoUrl}" alt="Foto de ${b.nombre}" class="table-photo"></td><td>${b.nombre} ${b.apellido}</td><td>${b.celular || 'N/A'}</td><td>${b.tipo_pago}</td><td><button class="btn-icon" onclick="editarBarbero(${b.barbero_id})"><i class="fas fa-edit"></i></button><button class="btn-icon" onclick="liquidarComisiones(${b.barbero_id})"><i class="fas fa-calculator"></i></button></td>`; barbersBody.appendChild(row); }); } else { barbersBody.innerHTML = '<tr><td colspan="5">No hay barberos registrados.</td></tr>'; } };
    window.editarBarbero = async (id) => { const barbero = await fetchData(`/api/barberos/${id}`); if (barbero) { document.getElementById('modal-barbero-titulo').textContent = 'Editar Barbero'; document.getElementById('barbero-id').value = barbero.barbero_id; document.getElementById('barbero-nombre').value = barbero.nombre; document.getElementById('barbero-apellido').value = barbero.apellido; document.getElementById('barbero-celular').value = barbero.celular || ''; document.getElementById('barbero-email').value = barbero.email || ''; document.getElementById('barbero-tipo-pago').value = barbero.tipo_pago; document.getElementById('barbero-valor').value = barbero.valor || ''; openModal('modal-barbero'); } };
    const cargarServicios = async () => { const servicios = await fetchData('/api/servicios'); const servicesBody = document.getElementById('services-body'); if (!servicesBody) return; servicesBody.innerHTML = '<tr><td colspan="3">Cargando...</td></tr>'; if (servicios && servicios.length > 0) { servicesBody.innerHTML = ''; servicios.forEach(s => { const row = document.createElement('tr'); row.innerHTML = `<td>${s.nombre}</td><td>${formatCurrency(parseFloat(s.precio))}</td><td><button class="btn-icon" onclick="editarServicio(${s.servicio_id}, '${s.nombre.replace(/'/g, "\\'")}', ${s.precio})"><i class="fas fa-edit"></i></button></td>`; servicesBody.appendChild(row); }); } else { servicesBody.innerHTML = '<tr><td colspan="3">No hay servicios registrados.</td></tr>'; } };
    window.editarServicio = (id, nombre, precio) => { document.getElementById('modal-servicio-titulo').innerHTML = '<i class="fas fa-concierge-bell"></i> Editar Servicio'; document.getElementById('servicio-submit-button').textContent = 'Actualizar Servicio'; document.getElementById('servicio-id').value = id; document.getElementById('servicio-nombre').value = nombre; document.getElementById('servicio-precio').value = precio; openModal('modal-servicio'); };
    
    window.logout = () => { 
        localStorage.removeItem('authToken'); 
        localStorage.removeItem('barberia_id');
        localStorage.removeItem('barberia_nombre');
        localStorage.removeItem('barberia_logo');
        localStorage.removeItem('theme');
        window.location.href = '/index.html'; 
    };

    const initCalendar = () => { 
        if (isCalendarInitialized) { 
            calendar.refetchEvents(); 
            return; 
        } 
        const calendarEl = document.getElementById('calendar'); 
        calendar = new FullCalendar.Calendar(calendarEl, { 
            initialView: 'timeGridWeek', 
            locale: 'es', 
            headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' }, 
            slotMinTime: '08:00:00', 
            allDaySlot: false, 
            navLinks: true, 
            events: (info, successCallback, failureCallback) => { 
                const barberoId = document.getElementById('barbero-filter').value; 
                const url = `${API_BASE_URL}/api/citas${barberoId ? `?barbero_id=${barberoId}` : ''}`; 
                fetch(url, { headers: { 'Authorization': `Bearer ${token}` } })
                    .then(response => {
                        if (!response.ok) {
                            if (response.status === 401 || response.status === 403) logout();
                            throw new Error('Network response was not ok');
                        }
                        return response.json();
                    })
                    .then(data => successCallback(data))
                    .catch(error => failureCallback(error)); 
            }, 
            eventClick: (info) => { abrirModalDetalleCita(info.event.id); }, 
            dateClick: (info) => { 
                document.getElementById('form-cita').reset(); 
                document.getElementById('modal-cita-titulo').textContent = 'Nueva Cita'; 
                const timezoneOffset = new Date().getTimezoneOffset() * 60000; 
                const localDate = new Date(info.date - timezoneOffset); 
                document.getElementById('cita-fecha').value = localDate.toISOString().slice(0, 16); 
                poblarSelectsFormularioCita(); 
                openModal('modal-cita'); 
            } 
        }); 
        calendar.render(); 
        poblarFiltroBarberos(); 
        isCalendarInitialized = true; 
    };
    
    const abrirModalDetalleCita = async (citaId) => { const cita = await fetchData(`/api/citas/${citaId}`); if (!cita) return; document.getElementById('detalle-cliente-nombre').textContent = `${cita.Cliente.nombre} ${cita.Cliente.apellido}`; document.getElementById('detalle-barbero-nombre').textContent = `${cita.Barbero.nombre} ${cita.Barbero.apellido}`; const estadoSpan = document.getElementById('detalle-cita-estado'); const btnPagar = document.getElementById('btn-registrar-pago'); const btnCancelar = document.getElementById('btn-cancelar-cita'); if (cita.estado === 'pagada') { estadoSpan.innerHTML = '<span class="pagada-badge">Pagada</span>'; btnPagar.style.display = 'none'; btnCancelar.style.display = 'none'; } else if (cita.estado === 'cancelada') { estadoSpan.innerHTML = '<span class="cancelada-badge">Cancelada</span>'; btnPagar.style.display = 'none'; btnCancelar.style.display = 'none'; } else { estadoSpan.textContent = 'Programada'; btnPagar.style.display = 'inline-block'; btnCancelar.style.display = 'inline-block'; } const serviciosUl = document.getElementById('detalle-cita-servicios'); serviciosUl.innerHTML = ''; let montoTotal = 0; cita.Servicios.forEach(servicio => { const li = document.createElement('li'); li.textContent = `${servicio.nombre} - ${formatCurrency(parseFloat(servicio.precio))}`; serviciosUl.appendChild(li); montoTotal += parseFloat(servicio.precio); }); document.getElementById('detalle-cita-total').textContent = `Total: ${formatCurrency(montoTotal)}`; btnPagar.onclick = () => abrirModalPago(cita.cita_id, montoTotal); btnCancelar.onclick = () => abrirModalCancelacion(cita.cita_id); openModal('modal-cita-detalle'); };
    const abrirModalPago = (citaId, montoTotal) => { closeModal(); document.getElementById('pago-cita-id').value = citaId; document.getElementById('pago-monto').value = formatCurrency(montoTotal); document.getElementById('form-pago').dataset.monto = montoTotal; openModal('modal-pago'); };
    const abrirModalCancelacion = (citaId) => { closeModal(); document.getElementById('form-cancelar-cita').reset(); document.getElementById('cancelar-cita-id').value = citaId; openModal('modal-cancelar-cita'); };
    const poblarSelectsFormularioCita = async () => { const [clientes, barberos, servicios] = await Promise.all([ fetchData('/api/clientes'), fetchData('/api/barberos'), fetchData('/api/servicios') ]); const clienteSelect = document.getElementById('cita-cliente'); clienteSelect.innerHTML = '<option value="">Seleccione un cliente</option>'; if(clientes) clientes.forEach(c => clienteSelect.innerHTML += `<option value="${c.cliente_id}">${c.nombre} ${c.apellido}</option>`); const barberoSelect = document.getElementById('cita-barbero'); barberoSelect.innerHTML = '<option value="">Seleccione un barbero</option>'; if(barberos) barberos.forEach(b => barberoSelect.innerHTML += `<option value="${b.barbero_id}">${b.nombre} ${b.apellido}</option>`); const servicioSelect = document.getElementById('cita-servicio'); servicioSelect.innerHTML = '<option value="">Seleccione un servicio</option>'; if(servicios) servicios.forEach(s => { servicioSelect.innerHTML += `<option value="${s.servicio_id}">${s.nombre}</option>`; }); };
    const poblarFiltroBarberos = async () => { const barberos = await fetchData('/api/barberos'); const barberoFilter = document.getElementById('barbero-filter'); const liqBarberoSelect = document.getElementById('liq-barbero-select'); if (barberoFilter) barberoFilter.innerHTML = '<option value="">Todos los Barberos</option>'; if (liqBarberoSelect) liqBarberoSelect.innerHTML = '<option value="todos">Todos los Barberos</option>'; if (barberos) { barberos.forEach(barbero => { const option = new Option(`${barbero.nombre} ${barbero.apellido}`, barbero.barbero_id); if (barberoFilter) barberoFilter.appendChild(option.cloneNode(true)); if (liqBarberoSelect) liqBarberoSelect.appendChild(option.cloneNode(true)); }); } };
    window.liquidarComisiones = (barberoId) => { document.getElementById('form-liquidacion').reset(); document.getElementById('liquidacion-resultado').innerHTML = ''; document.getElementById('liquidacion-barbero-id').value = barberoId; openModal('modal-liquidacion'); };
    const setupReportes = () => { const reportSelector = document.querySelector('.report-selector'); if(reportSelector) { reportSelector.addEventListener('click', (event) => { if (event.target.tagName === 'BUTTON') { const reportType = event.target.dataset.report; document.querySelectorAll('.report-selector .btn-primary').forEach(btn => btn.classList.remove('active')); event.target.classList.add('active'); document.querySelectorAll('.report-panel').forEach(panel => panel.classList.remove('active')); document.getElementById(`panel-reporte-${reportType}`).classList.add('active'); } }); } };
    window.exportarReportePDF = (tableId, reportName) => { const { jsPDF } = window.jspdf; const doc = new jsPDF(); doc.text(`Reporte de ${reportName}`, 14, 16); doc.autoTable({ html: `#${tableId}`, startY: 20, theme: 'grid', headStyles: { fillColor: [176, 143, 87] } }); doc.save(`Reporte_${reportName}_${new Date().toISOString().slice(0, 10)}.pdf`); };
    window.exportarReporteExcel = (tableId, reportName) => { const table = document.getElementById(tableId); const wb = XLSX.utils.table_to_book(table, { sheet: reportName }); XLSX.writeFile(wb, `Reporte_${reportName}_${new Date().toISOString().slice(0, 10)}.xlsx`); };
    
    window.borrarPago = async (pagoId) => {
        if (!pagoId) return;

        if (confirm('¿Estás seguro de que deseas eliminar este pago? La cita asociada volverá al estado "programada". Esta acción no se puede deshacer.')) {
            const result = await fetchData(`/api/pagos/${pagoId}`, 'DELETE');
            if (result) {
                alert(result.message);
                document.getElementById('btn-generar-reporte-ventas').click();
                if (calendar && views.citas.style.display === 'block') {
                    calendar.refetchEvents();
                }
            }
        }
    };
    
    const setupEventListeners = () => {
        document.getElementById('nav-dashboard').addEventListener('click', (e) => { e.preventDefault(); showView('dashboard'); });
        document.getElementById('nav-citas').addEventListener('click', (e) => { e.preventDefault(); showView('citas'); initCalendar(); });
        document.getElementById('nav-clients').addEventListener('click', (e) => { e.preventDefault(); showView('clients'); cargarClientes(); });
        document.getElementById('nav-inventory').addEventListener('click', (e) => { e.preventDefault(); showView('inventory'); cargarInventario(); });
        document.getElementById('nav-barbers').addEventListener('click', (e) => { e.preventDefault(); showView('barbers'); cargarBarberos(); });
        document.getElementById('nav-services').addEventListener('click', (e) => { e.preventDefault(); showView('services'); cargarServicios(); });
        document.getElementById('nav-reports').addEventListener('click', (e) => { e.preventDefault(); showView('reports'); poblarFiltroBarberos(); });
        document.getElementById('btn-back-to-clients').addEventListener('click', () => showView('clients'));
        document.getElementById('logout-button').addEventListener('click', logout);
        document.getElementById('export-pdf')?.addEventListener('click', () => exportarReportePDF('inventory-table', 'Inventario'));
        document.getElementById('export-excel')?.addEventListener('click', () => exportarReporteExcel('inventory-table', 'Inventario'));
        document.getElementById('btn-open-modal-gasto')?.addEventListener('click', () => openModal('modal-gasto'));
        document.getElementById('btn-open-modal-producto')?.addEventListener('click', () => openModal('modal-producto'));
        document.getElementById('btn-open-modal-compra')?.addEventListener('click', () => { cargarProductosEnSelect('compra-producto'); openModal('modal-compra'); });
        document.getElementById('btn-open-modal-consumo')?.addEventListener('click', () => { cargarProductosEnSelect('consumo-producto'); openModal('modal-consumo'); });
        document.getElementById('btn-open-modal-consumo-interno')?.addEventListener('click', () => { cargarProductosEnSelect('consumo-interno-producto'); openModal('modal-consumo-interno'); });
        document.getElementById('btn-nuevo-cliente')?.addEventListener('click', () => { document.getElementById('form-cliente').reset(); document.getElementById('modal-cliente-titulo').textContent = 'Nuevo Cliente'; document.getElementById('cliente-id').value = ''; openModal('modal-cliente'); });
        document.getElementById('btn-nuevo-barbero')?.addEventListener('click', () => { document.getElementById('form-barbero').reset(); document.getElementById('modal-barbero-titulo').textContent = 'Nuevo Barbero'; document.getElementById('barbero-id').value = ''; openModal('modal-barbero'); });
        document.getElementById('btn-nuevo-servicio')?.addEventListener('click', () => { document.getElementById('form-servicio').reset(); document.getElementById('servicio-id').value = ''; document.getElementById('modal-servicio-titulo').innerHTML = '<i class="fas fa-concierge-bell"></i> Nuevo Servicio'; document.getElementById('servicio-submit-button').textContent = 'Guardar Servicio'; openModal('modal-servicio'); });
        document.querySelectorAll('.close-button').forEach(btn => btn.addEventListener('click', closeModal));
        if(modalOverlay) modalOverlay.addEventListener('click', closeModal);
        document.getElementById('form-cita').addEventListener('submit', async (event) => { event.preventDefault(); const fechaInicio = new Date(document.getElementById('cita-fecha').value); const duracion = parseInt(document.getElementById('cita-duracion').value, 10); const fechaFin = new Date(fechaInicio.getTime() + duracion * 60000); const servicioSeleccionado = document.getElementById('cita-servicio').value; const nuevaCita = { cliente_id: document.getElementById('cita-cliente').value, barbero_id: document.getElementById('cita-barbero').value, fecha_hora_inicio: fechaInicio.toISOString(), fecha_hora_fin: fechaFin.toISOString(), servicios: [servicioSeleccionado] }; if (!nuevaCita.cliente_id || !nuevaCita.barbero_id || !servicioSeleccionado) { alert('Por favor complete todos los campos, incluyendo el servicio.'); return; } const result = await fetchData('/api/citas', 'POST', nuevaCita); if (result) { alert(result.message); closeModal(); calendar.refetchEvents(); } });
        document.getElementById('form-gasto').addEventListener('submit', async (event) => { event.preventDefault(); const gasto = { descripcion: document.getElementById('gasto-descripcion').value, monto: document.getElementById('gasto-monto').value, tipo: document.getElementById('gasto-tipo').value }; const result = await fetchData('/api/gastos', 'POST', gasto); if (result) { alert(result.message); closeModal(); document.getElementById('form-gasto').reset(); cargarKPIs(); cargarDashboardSummary(); } });
        document.getElementById('form-producto').addEventListener('submit', async (event) => { event.preventDefault(); const producto = { nombre: document.getElementById('producto-nombre').value, precio_venta: document.getElementById('producto-precio').value, costo_compra: document.getElementById('producto-costo').value, stock_minimo: document.getElementById('producto-stock').value }; const result = await fetchData('/api/productos', 'POST', producto); if (result) { alert(result.message); closeModal(); document.getElementById('form-producto').reset(); } });
        document.getElementById('form-compra').addEventListener('submit', async (event) => { event.preventDefault(); const compra = { producto_id: document.getElementById('compra-producto').value, cantidad: document.getElementById('compra-cantidad').value, costo_total: document.getElementById('compra-costo').value }; if (!compra.producto_id) { alert('Por favor, selecciona un producto.'); return; } const result = await fetchData('/api/compras', 'POST', compra); if (result) { alert(result.message); closeModal(); document.getElementById('form-compra').reset(); cargarAlertaStock(); } });
        document.getElementById('form-consumo').addEventListener('submit', async (event) => { event.preventDefault(); const consumo = { producto_id: document.getElementById('consumo-producto').value, cantidad: document.getElementById('consumo-cantidad').value }; if (!consumo.producto_id) { alert('Por favor, selecciona un producto.'); return; } const result = await fetchData('/api/ventas-consumo', 'POST', consumo); if (result) { alert(result.message); closeModal(); document.getElementById('form-consumo').reset(); cargarAlertaStock(); cargarKPIs(); cargarDashboardSummary(); } });
        document.getElementById('form-consumo-interno').addEventListener('submit', async (event) => { event.preventDefault(); const consumo = { producto_id: document.getElementById('consumo-interno-producto').value, cantidad: document.getElementById('consumo-interno-cantidad').value }; if (!consumo.producto_id) { alert('Por favor, selecciona un producto.'); return; } const result = await fetchData('/api/consumos', 'POST', consumo); if (result) { alert(result.message); closeModal(); document.getElementById('form-consumo-interno').reset(); cargarAlertaStock(); } });
        document.getElementById('form-cliente').addEventListener('submit', async (event) => { event.preventDefault(); const id = document.getElementById('cliente-id').value; const clienteData = { nombre: document.getElementById('cliente-nombre').value, apellido: document.getElementById('cliente-apellido').value, telefono: document.getElementById('cliente-telefono').value, email: document.getElementById('cliente-email').value || null, fecha_nacimiento: document.getElementById('cliente-fecha-nacimiento').value || null, notas: document.getElementById('cliente-notas').value || null }; let result; if (id) { result = await fetchData(`/api/clientes/${id}`, 'PUT', clienteData); } else { result = await fetchData('/api/clientes', 'POST', clienteData); } if (result) { alert(`¡Cliente ${id ? 'actualizado' : 'creado'} exitosamente!`); closeModal(); if (views.clients.style.display === 'block') { cargarClientes(); } if (views['client-detail'].style.display === 'block' && id) { verCliente(id); } } });
        document.getElementById('form-barbero').addEventListener('submit', async (event) => { event.preventDefault(); const id = document.getElementById('barbero-id').value; const barberoData = { nombre: document.getElementById('barbero-nombre').value, apellido: document.getElementById('barbero-apellido').value, celular: document.getElementById('barbero-celular').value || null, email: document.getElementById('barbero-email').value || null, tipo_pago: document.getElementById('barbero-tipo-pago').value, valor: document.getElementById('barbero-valor').value || null }; let barberoResult = id ? await fetchData(`/api/barberos/${id}`, 'PUT', barberoData) : await fetchData('/api/barberos', 'POST', barberoData); if (barberoResult) { const fotoInput = document.getElementById('barbero-foto'); if (fotoInput.files.length > 0) { const formData = new FormData(); formData.append('foto', fotoInput.files[0]); await fetchData(`/api/barberos/${barberoResult.barbero_id}/foto`, 'POST', formData); } alert(`¡Barbero ${id ? 'actualizado' : 'creado'} exitosamente!`); closeModal(); cargarBarberos(); } });
        document.getElementById('form-servicio').addEventListener('submit', async (event) => { event.preventDefault(); const id = document.getElementById('servicio-id').value; const servicioData = { nombre: document.getElementById('servicio-nombre').value, precio: document.getElementById('servicio-precio').value }; let result; if (id) { result = await fetchData(`/api/servicios/${id}`, 'PUT', servicioData); } else { result = await fetchData('/api/servicios', 'POST', servicioData); } if (result) { alert(result.message); closeModal(); cargarServicios(); } });
        document.getElementById('form-pago').addEventListener('submit', async (event) => { event.preventDefault(); const pagoData = { cita_id: document.getElementById('pago-cita-id').value, monto_total: document.getElementById('form-pago').dataset.monto, metodo_pago: document.getElementById('pago-metodo').value }; const result = await fetchData('/api/pagos', 'POST', pagoData); if (result && result.pdfUrl) { closeModal(); if (calendar) { calendar.refetchEvents(); } if (confirm("¡Pago registrado con éxito! ¿Deseas ver e imprimir la factura?")) { window.open(API_BASE_URL + result.pdfUrl, '_blank'); } } else if (result) { alert(result.message); closeModal(); if (calendar) { calendar.refetchEvents(); } } });
        document.getElementById('form-cancelar-cita').addEventListener('submit', async (event) => { event.preventDefault(); const citaId = document.getElementById('cancelar-cita-id').value; const motivo = document.getElementById('cancelar-motivo').value; const result = await fetchData(`/api/citas/${citaId}/cancelar`, 'PUT', { motivo }); if (result) { alert(result.message); closeModal(); if (calendar) { calendar.refetchEvents(); } } });
        document.querySelector('.btn-upload[data-tipo="antes"]')?.addEventListener('click', async () => { const fileInput = document.getElementById('foto-antes-input'); if(fileInput.files.length > 0) { const formData = new FormData(); formData.append('foto', fileInput.files[0]); formData.append('tipo', 'antes'); const result = await fetchData(`/api/clientes/${currentClientId}/foto`, 'POST', formData); if(result) { alert(result.message); verCliente(currentClientId); } } });
        document.querySelector('.btn-upload[data-tipo="despues"]')?.addEventListener('click', async () => { const fileInput = document.getElementById('foto-despues-input'); if(fileInput.files.length > 0) { const formData = new FormData(); formData.append('foto', fileInput.files[0]); formData.append('tipo', 'despues'); const result = await fetchData(`/api/clientes/${currentClientId}/foto`, 'POST', formData); if(result) { alert(result.message); verCliente(currentClientId); } } });
        document.getElementById('barbero-filter').addEventListener('change', () => { if (calendar) { calendar.refetchEvents(); } });
        
        document.getElementById('btn-generar-reporte-ventas').addEventListener('click', async () => { 
            const fechaInicio = document.getElementById('ventas-fecha-inicio').value; 
            const fechaFin = document.getElementById('ventas-fecha-fin').value; 
            if (!fechaInicio || !fechaFin) { alert('Por favor, seleccione ambas fechas.'); return; } 
            
            const reportBody = document.getElementById('body-reporte-ventas'); 
            const colSpan = userRole === 'administrador' ? 6 : 5;
            reportBody.innerHTML = `<tr><td colspan="${colSpan}">Generando reporte...</td></tr>`; 
            
            const data = await fetchData(`/api/reportes/ventas?fechaInicio=${fechaInicio}&fechaFin=${fechaFin}`); 
            const exportButtons = document.getElementById('export-buttons-ventas'); 
            
            if (data && data.length > 0) { 
                reportBody.innerHTML = ''; 
                data.forEach(pago => { 
                    const row = document.createElement('tr');
                    let accionesHtml = '';

                    if (userRole === 'administrador') {
                        accionesHtml = `<td><button class="btn-icon btn-danger" onclick="borrarPago(${pago.pago_id})" title="Eliminar Pago"><i class="fas fa-trash"></i></button></td>`;
                    }

                    row.innerHTML = `<td>${new Date(pago.fecha_pago).toLocaleDateString('es-CO')}</td>
                                     <td>${pago.Cita.Barbero.nombre} ${pago.Cita.Barbero.apellido}</td>
                                     <td>${pago.Cita.Cliente.nombre} ${pago.Cita.Cliente.apellido}</td>
                                     <td>${pago.Cita.Servicios.map(s => s.nombre).join(', ')}</td>
                                     <td>${formatCurrency(parseFloat(pago.monto_total))}</td>
                                     ${accionesHtml}`;
                    reportBody.appendChild(row); 
                }); 
                exportButtons.style.display = 'inline-flex'; 
            } else { 
                reportBody.innerHTML = `<tr><td colspan="${colSpan}">No se encontraron ingresos en el rango de fechas seleccionado.</td></tr>`; 
                exportButtons.style.display = 'none'; 
            } 
        });

        document.getElementById('btn-generar-reporte-gastos').addEventListener('click', async () => { const fechaInicio = document.getElementById('gastos-fecha-inicio').value; const fechaFin = document.getElementById('gastos-fecha-fin').value; if (!fechaInicio || !fechaFin) { alert('Por favor, seleccione ambas fechas.'); return; } const reportBody = document.getElementById('body-reporte-gastos'); reportBody.innerHTML = '<tr><td colspan="4">Generando reporte...</td></tr>'; const data = await fetchData(`/api/reportes/gastos?fechaInicio=${fechaInicio}&fechaFin=${fechaFin}`); const exportButtons = document.getElementById('export-buttons-gastos'); if (data && data.length > 0) { reportBody.innerHTML = ''; data.forEach(gasto => { const row = document.createElement('tr'); const tipoGastoMap = { 'gasto_operativo': 'Gasto Operativo', 'costo_fijo': 'Costo Fijo', 'costo_variable': 'Costo Variable' }; row.innerHTML = `<td>${new Date(gasto.fecha).toLocaleDateString('es-CO')}</td><td>${gasto.descripcion}</td><td>${tipoGastoMap[gasto.tipo] || gasto.tipo}</td><td>${formatCurrency(parseFloat(gasto.monto))}</td>`; reportBody.appendChild(row); }); exportButtons.style.display = 'inline-flex'; } else { reportBody.innerHTML = '<tr><td colspan="4">No se encontraron gastos en el rango de fechas seleccionado.</td></tr>'; exportButtons.style.display = 'none'; } });
        document.getElementById('btn-generar-reporte-cancel').addEventListener('click', async () => { const fechaInicio = document.getElementById('cancel-fecha-inicio').value; const fechaFin = document.getElementById('cancel-fecha-fin').value; if (!fechaInicio || !fechaFin) { alert('Por favor, seleccione ambas fechas.'); return; } const reportBody = document.getElementById('body-reporte-cancel'); reportBody.innerHTML = '<tr><td colspan="5">Generando reporte...</td></tr>'; const data = await fetchData(`/api/reportes/cancelaciones?fechaInicio=${fechaInicio}&fechaFin=${fechaFin}`); const exportButtons = document.getElementById('export-buttons-cancel'); if (data && data.length > 0) { reportBody.innerHTML = ''; data.forEach(cita => { const row = document.createElement('tr'); row.innerHTML = `<td>${new Date(cita.fecha_cancelacion).toLocaleString('es-CO')}</td><td>${new Date(cita.fecha_hora_inicio).toLocaleString('es-CO')}</td><td>${cita.Cliente.nombre} ${cita.Cliente.apellido}</td><td>${cita.Barbero.nombre} ${cita.Barbero.apellido}</td><td>${cita.motivo_cancelacion || 'No especificado'}</td>`; reportBody.appendChild(row); }); exportButtons.style.display = 'inline-flex'; } else { reportBody.innerHTML = '<tr><td colspan="5">No se encontraron citas canceladas en el rango de fechas seleccionado.</td></tr>'; exportButtons.style.display = 'none'; } });
        document.getElementById('btn-generar-reporte-liq').addEventListener('click', async () => { const barberoId = document.getElementById('liq-barbero-select').value; const fechaInicio = document.getElementById('liq-fecha-inicio').value; const fechaFin = document.getElementById('liq-fecha-fin').value; if (!fechaInicio || !fechaFin) { alert('Por favor, seleccione ambas fechas.'); return; } const reportBody = document.getElementById('body-reporte-liq'); reportBody.innerHTML = '<tr><td colspan="4">Generando liquidación...</td></tr>'; const data = await fetchData(`/api/reportes/liquidacion?fechaInicio=${fechaInicio}&fechaFin=${fechaFin}&barberoId=${barberoId}`); const exportButtons = document.getElementById('export-buttons-liq'); if (data && data.length > 0) { reportBody.innerHTML = ''; data.forEach(liq => { const row = document.createElement('tr'); row.innerHTML = `<td>${liq.barbero}</td><td>${formatCurrency(parseFloat(liq.ingresosGenerados))}</td><td>${liq.porcentajeComision} %</td><td>${formatCurrency(parseFloat(liq.valorAPagar))}</td>`; reportBody.appendChild(row); }); exportButtons.style.display = 'inline-flex'; } else { reportBody.innerHTML = '<tr><td colspan="4">No se encontraron datos para la liquidación.</td></tr>'; exportButtons.style.display = 'none'; } });
    };

    const initializeApp = () => {
        loadBarberiaConfig();
        applyRolePermissions(userRole);
        if (userRole === 'cliente') {
            showView('citas');
            initCalendar();
        } else {
            showView('dashboard');
            cargarKPIs();
            cargarDashboardSummary(); // <--- LLAMADA A LA NUEVA FUNCIÓN
            cargarAlertaStock();
        }
        setupEventListeners();
        setupReportes();
        
        if (userRole === 'administrador') {
             const openaiFloatButton = document.getElementById("openai-float-button");
            const openaiModal = document.getElementById("openai-modal");
            const openaiOverlay = document.getElementById("openai-modal-overlay");
            const openaiClose = document.getElementById("openai-close");
            const openaiAskButton = document.getElementById("openai-ask-button");
            const openaiQuestion = document.getElementById("openai-question");
            const openaiResults = document.getElementById("openai-results-container");
            const openaiStatus = document.getElementById("openai-status");

            if (openaiFloatButton) {
                openaiFloatButton.onclick = () => {
                    openaiModal.style.display = "block";
                    openaiOverlay.style.display = "block";
                };

                const closeModalOpenAI = () => {
                    openaiModal.style.display = "none";
                    openaiOverlay.style.display = "none";
                    openaiResults.innerHTML = "";
                    openaiQuestion.value = "";
                    openaiStatus.textContent = "";
                };

                openaiClose.onclick = closeModalOpenAI;
                openaiOverlay.onclick = closeModalOpenAI;

                openaiAskButton.onclick = async () => {
                    const pregunta = openaiQuestion.value.trim();
                    if (!pregunta) {
                        openaiStatus.textContent = "Por favor, escribe una pregunta.";
                        return;
                    }

                    openaiAskButton.disabled = true;
                    openaiAskButton.textContent = "Consultando...";
                    openaiStatus.textContent = "Consultando OpenAI...";
                    openaiResults.innerHTML = "";

                    try {
                        const res = await fetch(`${API_BASE_URL}/api/admin/ask-openai`, {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "Authorization": `Bearer ${token}`
                            },
                            body: JSON.stringify({ pregunta })
                        });
                        
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.message || "Error al consultar el Asistente OpenAI.");

                        openaiStatus.textContent = "";

                        if (Array.isArray(data) && data.length) {
                            const headers = Object.keys(data[0]);
                            const table = document.createElement("table");
                            const thead = document.createElement("thead");
                            const headerRow = document.createElement("tr");

                            headers.forEach(h => {
                                const th = document.createElement("th");
                                th.textContent = h.replace(/_/g, ' ');
                                headerRow.appendChild(th);
                            });

                            thead.appendChild(headerRow);
                            table.appendChild(thead);

                           const tbody = document.createElement("tbody");
                            data.forEach(row => {
                                const tr = document.createElement("tr");
                                headers.forEach(h => {
                                    const td = document.createElement("td");
                                    let cellValue = row[h];
                                    if (typeof cellValue === 'number' && (h.includes('monto') || h.includes('precio') || h.includes('total') || h.includes('valor'))) {
                                       cellValue = formatCurrency(cellValue);
                                    }
                                    td.textContent = cellValue;
                                    tr.appendChild(td);
                                });
                                tbody.appendChild(tr);
                            });
                            table.appendChild(tbody);
                            openaiResults.appendChild(table);
                        } else {
                            openaiStatus.textContent = "Sin resultados para mostrar.";
                        }
                    } catch (err) {
                        console.error(err);
                        openaiStatus.textContent = "Ocurrió un error al consultar OpenAI.";
                    } finally {
                        openaiAskButton.disabled = false;
                        openaiAskButton.textContent = "Consultar OpenAI";
                    }
                };
            }
        }
    };

    initializeApp();
});

