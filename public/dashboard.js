document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('authToken');
    if (!token) { window.location.href = '/index.html'; return; }

    const API_BASE_URL = "https://barberflowplus-5e0226fd2073.herokuapp.com";

    const views = {
        dashboard: document.getElementById('view-dashboard'),
        inventory: document.getElementById('view-inventory'),
        clients: document.getElementById('view-clients'),
        'client-detail': document.getElementById('view-client-detail'),
        barbers: document.getElementById('view-barbers')
    };
    const navLinks = {
        dashboard: document.getElementById('nav-dashboard').parentElement,
        inventory: document.getElementById('nav-inventory').parentElement,
        clients: document.getElementById('nav-clients').parentElement,
        barbers: document.getElementById('nav-barbers').parentElement
    };
    let currentClientId = null;

    const showView = (viewName) => {
        let mainView = viewName.split('-')[0];
        if (mainView === 'client') mainView = 'clients';
        Object.values(views).forEach(view => { if(view) view.style.display = 'none'; });
        Object.values(navLinks).forEach(link => { if(link) link.classList.remove('active'); });
        if (views[viewName]) views[viewName].style.display = 'block';
        if (navLinks[mainView]) navLinks[mainView].classList.add('active');
    };
    
    const fetchData = async (endpoint, method = 'GET', body = null) => {
        const headers = { 'Authorization': `Bearer ${token}` };
        const config = { method, headers };
        if (body instanceof FormData) { config.body = body; } 
        else if (body) { config.body = JSON.stringify(body); headers['Content-Type'] = 'application/json'; }
        try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
            const responseData = await response.json();
            if (!response.ok) { alert(`Error: ${responseData.message || 'Ocurrió un problema.'}`); return null; }
            return responseData;
        } catch (error) { alert('Error de conexión con el servidor.'); return null; }
    };

    let utilityChart = null;
    const cargarKPIs = async () => { const data = await fetchData('/api/dashboard/kpis'); if (data) { document.getElementById('kpi-ingresos').textContent = `$${parseFloat(data.ingresos).toLocaleString('es-CO')}`; document.getElementById('kpi-gastos').textContent = `$${parseFloat(data.gastos).toLocaleString('es-CO')}`; document.getElementById('kpi-utilidad').textContent = `$${parseFloat(data.utilidad).toLocaleString('es-CO')}`; document.getElementById('kpi-citas').textContent = data.citas; } };
    const cargarGraficoSemanal = async () => { const data = await fetchData('/api/reportes/semanal'); if (data && document.getElementById('utilityChart')) { const ctx = document.getElementById('utilityChart').getContext('2d'); if (utilityChart) { utilityChart.destroy(); } utilityChart = new Chart(ctx, { type: 'line', data: { labels: data.labels, datasets: [{ label: 'Ingresos', data: data.ingresosData, borderColor: '#2ecc71', backgroundColor: 'rgba(46, 204, 113, 0.1)', fill: true, tension: 0.4 }, { label: 'Gastos', data: data.gastosData, borderColor: '#e74c3c', backgroundColor: 'rgba(231, 76, 60, 0.1)', fill: true, tension: 0.4 }] }, options: { responsive: true, maintainAspectRatio: false } }); } };
    const cargarAlertaStock = async () => { const data = await fetchData('/api/productos/bajo-stock'); const lowStockList = document.getElementById('low-stock-list'); if (!lowStockList) return; lowStockList.innerHTML = ''; if (data && data.length > 0) { data.forEach(producto => { const li = document.createElement('li'); li.innerHTML = `<span>${producto.nombre}</span> <span>(${producto.stock_actual} restantes)</span>`; lowStockList.appendChild(li); }); } else { lowStockList.innerHTML = '<li><span>No hay productos con bajo stock.</span></li>'; } };
    const cargarInventario = async () => { const productos = await fetchData('/api/productos'); const inventoryBody = document.getElementById('inventory-body'); if (!inventoryBody) return; inventoryBody.innerHTML = '<tr><td colspan="6">Cargando...</td></tr>'; if (productos && productos.length > 0) { inventoryBody.innerHTML = ''; productos.forEach(p => { const row = document.createElement('tr'); const totalValue = (p.stock_actual * p.precio_venta).toLocaleString('es-CO', { style: 'currency', currency: 'COP' }); const stockClass = p.stock_actual <= p.stock_minimo ? 'stock-low' : 'stock-ok'; row.innerHTML = `<td>${p.nombre}</td><td class="${stockClass}">${p.stock_actual}</td><td>${p.stock_minimo}</td><td>${parseFloat(p.precio_venta).toLocaleString('es-CO', { style: 'currency', currency: 'COP' })}</td><td>${parseFloat(p.costo_compra).toLocaleString('es-CO', { style: 'currency', currency: 'COP' })}</td><td>${totalValue}</td>`; inventoryBody.appendChild(row); }); } else { inventoryBody.innerHTML = '<tr><td colspan="6">No hay productos en el inventario.</td></tr>'; } };
    const exportPDF = () => { const { jsPDF } = window.jspdf; const doc = new jsPDF(); doc.text("Reporte de Inventario - BarberFlow+", 14, 16); doc.autoTable({ html: '#inventory-table', startY: 20, theme: 'grid', headStyles: { fillColor: [176, 143, 87] } }); doc.save(`reporte_inventario_${new Date().toISOString().slice(0,10)}.pdf`); };
    const exportExcel = () => { const table = document.getElementById('inventory-table'); const wb = XLSX.utils.table_to_book(table, { sheet: "Inventario" }); XLSX.writeFile(wb, `reporte_inventario_${new Date().toISOString().slice(0,10)}.xlsx`); };
    const cargarClientes = async () => { const clientes = await fetchData('/api/clientes'); const clientsBody = document.getElementById('clients-body'); if (!clientsBody) return; clientsBody.innerHTML = '<tr><td colspan="4">Cargando...</td></tr>'; if (clientes && clientes.length > 0) { clientsBody.innerHTML = ''; clientes.forEach(c => { const row = document.createElement('tr'); row.innerHTML = `<td>${c.nombre} ${c.apellido}</td><td>${c.telefono}</td><td>${c.email || 'N/A'}</td><td><button class="btn-icon" onclick="verCliente(${c.cliente_id})"><i class="fas fa-eye"></i></button><button class="btn-icon" onclick="editarCliente(${c.cliente_id})"><i class="fas fa-edit"></i></button></td>`; clientsBody.appendChild(row); }); } else { clientsBody.innerHTML = '<tr><td colspan="4">No hay clientes registrados.</td></tr>'; } };
    window.verCliente = async (id) => { currentClientId = id; const cliente = await fetchData(`/api/clientes/${id}/completo`); if (cliente) { document.getElementById('client-detail-name').textContent = `${cliente.nombre} ${cliente.apellido}`; document.getElementById('client-detail-info').innerHTML = `<p><strong>Teléfono:</strong> ${cliente.telefono}</p><p><strong>Email:</strong> ${cliente.email || 'N/A'}</p><p><strong>Nacimiento:</strong> ${cliente.fecha_nacimiento || 'N/A'}</p><p><strong>Notas:</strong></p><p>${cliente.notas || 'No hay notas.'}</p>`; const citasUl = document.getElementById('client-detail-citas'); citasUl.innerHTML = ''; if (cliente.Citas && cliente.Citas.length > 0) { cliente.Citas.forEach(cita => { const li = document.createElement('li'); const fecha = new Date(cita.fecha_hora_inicio).toLocaleString('es-CO'); li.textContent = `${fecha} - ${cita.Servicios.map(s=>s.nombre).join(', ')} con ${cita.Barbero.nombre}`; citasUl.appendChild(li); }); } else { citasUl.innerHTML = '<li>No hay historial de citas.</li>'; } document.getElementById('btn-edit-client-from-detail').onclick = () => editarCliente(id); document.getElementById('foto-antes-img').src = cliente.foto_antes_url ? cliente.foto_antes_url : 'placeholder.png'; document.getElementById('foto-despues-img').src = cliente.foto_despues_url ? cliente.foto_despues_url : 'placeholder.png'; showView('client-detail'); } };
    window.editarCliente = async (id) => { const cliente = await fetchData(`/api/clientes/${id}/completo`); if(cliente){ document.getElementById('modal-cliente-titulo').textContent = 'Editar Cliente'; document.getElementById('cliente-id').value = cliente.cliente_id; document.getElementById('cliente-nombre').value = cliente.nombre; document.getElementById('cliente-apellido').value = cliente.apellido; document.getElementById('cliente-telefono').value = cliente.telefono; document.getElementById('cliente-email').value = cliente.email || ''; document.getElementById('cliente-fecha-nacimiento').value = cliente.fecha_nacimiento || ''; document.getElementById('cliente-notas').value = cliente.notas || ''; openModal('modal-cliente'); } };
    const cargarBarberos = async () => { const barberos = await fetchData('/api/barberos'); const barbersBody = document.getElementById('barbers-body'); if (!barbersBody) return; barbersBody.innerHTML = '<tr><td colspan="5">Cargando...</td></tr>'; if (barberos && barberos.length > 0) { barbersBody.innerHTML = ''; barberos.forEach(b => { const row = document.createElement('tr'); const fotoUrl = b.foto_url ? b.foto_url : 'placeholder.png'; row.innerHTML = `<td><img src="${fotoUrl}" alt="Foto de ${b.nombre}" class="table-photo"></td><td>${b.nombre} ${b.apellido}</td><td>${b.celular || 'N/A'}</td><td>${b.tipo_pago}</td><td><button class="btn-icon" onclick="editarBarbero(${b.barbero_id})"><i class="fas fa-edit"></i></button><button class="btn-icon" onclick="gestionarHorario(${b.barbero_id})"><i class="fas fa-clock"></i></button></td>`; barbersBody.appendChild(row); }); } else { barbersBody.innerHTML = '<tr><td colspan="5">No hay barberos registrados.</td></tr>'; } };
    window.editarBarbero = async (id) => { const barbero = await fetchData(`/api/barberos/${id}`); if (barbero) { document.getElementById('modal-barbero-titulo').textContent = 'Editar Barbero'; document.getElementById('barbero-id').value = barbero.barbero_id; document.getElementById('barbero-nombre').value = barbero.nombre; document.getElementById('barbero-apellido').value = barbero.apellido; document.getElementById('barbero-celular').value = barbero.celular || ''; document.getElementById('barbero-email').value = barbero.email || ''; document.getElementById('barbero-tipo-pago').value = barbero.tipo_pago; document.getElementById('barbero-valor').value = barbero.valor || ''; openModal('modal-barbero'); } };
    window.gestionarHorario = (id) => alert(`Próximamente: Gestionar horario para barbero ${id}`);
    const cargarProductosEnSelect = async (selectId) => { const productos = await fetchData('/api/productos'); const selectElement = document.getElementById(selectId); if (productos && selectElement) { selectElement.innerHTML = '<option value="">-- Selecciona un producto --</option>'; productos.forEach(producto => { const option = document.createElement('option'); option.value = producto.producto_id; option.textContent = `${producto.nombre} (Stock: ${producto.stock_actual})`; selectElement.appendChild(option); }); } };
    window.logout = () => { localStorage.removeItem('authToken'); window.location.href = '/index.html'; };
    const modalOverlay = document.getElementById('modal-overlay');
    const modals = document.querySelectorAll('.modal');
    const openModal = (modalId) => { const modal = document.getElementById(modalId); if(modal) modal.style.display = 'block'; if(modalOverlay) modalOverlay.style.display = 'block'; };
    const closeModal = (modalId) => { const modal = document.getElementById(modalId); if(modal) modal.style.display = 'none'; if (!document.querySelector('.modal[style*="display: block"]')) { if(modalOverlay) modalOverlay.style.display = 'none'; } };
    
    // ASIGNACIÓN SEGURA DE EVENT LISTENERS
    const setupEventListeners = () => {
        document.getElementById('nav-dashboard')?.addEventListener('click', (e) => { e.preventDefault(); showView('dashboard'); });
        document.getElementById('nav-inventory')?.addEventListener('click', (e) => { e.preventDefault(); cargarInventario(); showView('inventory'); });
        document.getElementById('nav-clients')?.addEventListener('click', (e) => { e.preventDefault(); cargarClientes(); showView('clients'); });
        document.getElementById('nav-barbers')?.addEventListener('click', (e) => { e.preventDefault(); cargarBarberos(); showView('barbers'); });
        document.getElementById('btn-back-to-clients')?.addEventListener('click', () => showView('clients'));
        document.getElementById('export-pdf')?.addEventListener('click', exportPDF);
        document.getElementById('export-excel')?.addEventListener('click', exportExcel);
        document.getElementById('btn-open-modal-gasto')?.addEventListener('click', () => openModal('modal-gasto'));
        document.getElementById('btn-open-modal-producto')?.addEventListener('click', () => openModal('modal-producto'));
        document.getElementById('btn-open-modal-compra')?.addEventListener('click', () => { cargarProductosEnSelect('compra-producto'); openModal('modal-compra'); });
        document.getElementById('btn-open-modal-consumo')?.addEventListener('click', () => { cargarProductosEnSelect('consumo-producto'); openModal('modal-consumo'); });
        document.getElementById('btn-nuevo-cliente')?.addEventListener('click', () => { document.getElementById('form-cliente').reset(); document.getElementById('modal-cliente-titulo').textContent = 'Nuevo Cliente'; document.getElementById('cliente-id').value = ''; openModal('modal-cliente'); });
        document.getElementById('btn-nuevo-barbero')?.addEventListener('click', () => { document.getElementById('form-barbero').reset(); document.getElementById('modal-barbero-titulo').textContent = 'Nuevo Barbero'; document.getElementById('barbero-id').value = ''; openModal('modal-barbero'); });
        ['close-gasto', 'close-producto', 'close-compra', 'close-consumo', 'close-cliente', 'close-barbero'].forEach(id => { const el = document.getElementById(id); if (el) el.addEventListener('click', () => closeModal(id.replace('close-', 'modal-'))); });
        if (modalOverlay) modalOverlay.addEventListener('click', () => { modals.forEach(modal => modal.style.display = 'none'); modalOverlay.style.display = 'none'; });
        document.getElementById('form-gasto')?.addEventListener('submit', async (event) => { event.preventDefault(); const gasto = { descripcion: document.getElementById('gasto-descripcion').value, monto: document.getElementById('gasto-monto').value, tipo: document.getElementById('gasto-tipo').value }; const result = await fetchData('/api/gastos', 'POST', gasto); if (result) { alert(result.message); closeModal('modal-gasto'); document.getElementById('form-gasto').reset(); cargarKPIs(); cargarGraficoSemanal(); } });
        document.getElementById('form-producto')?.addEventListener('submit', async (event) => { event.preventDefault(); const producto = { nombre: document.getElementById('producto-nombre').value, precio_venta: document.getElementById('producto-precio').value, costo_compra: document.getElementById('producto-costo').value, stock_minimo: document.getElementById('producto-stock').value }; const result = await fetchData('/api/productos', 'POST', producto); if (result) { alert(result.message); closeModal('modal-producto'); document.getElementById('form-producto').reset(); } });
        document.getElementById('form-compra')?.addEventListener('submit', async (event) => { event.preventDefault(); const compra = { producto_id: document.getElementById('compra-producto').value, cantidad: document.getElementById('compra-cantidad').value, costo_total: document.getElementById('compra-costo').value }; if (!compra.producto_id) { alert('Por favor, selecciona un producto.'); return; } const result = await fetchData('/api/compras', 'POST', compra); if (result) { alert(result.message); closeModal('modal-compra'); document.getElementById('form-compra').reset(); cargarAlertaStock(); } });
        document.getElementById('form-consumo')?.addEventListener('submit', async (event) => { event.preventDefault(); const consumo = { producto_id: document.getElementById('consumo-producto').value, cantidad: document.getElementById('consumo-cantidad').value }; if (!consumo.producto_id) { alert('Por favor, selecciona un producto.'); return; } const result = await fetchData('/api/ventas-consumo', 'POST', consumo); if (result) { alert(result.message); closeModal('modal-consumo'); document.getElementById('form-consumo').reset(); cargarAlertaStock(); cargarKPIs(); cargarGraficoSemanal(); } });
        document.getElementById('form-cliente')?.addEventListener('submit', async (event) => { event.preventDefault(); const id = document.getElementById('cliente-id').value; const clienteData = { nombre: document.getElementById('cliente-nombre').value, apellido: document.getElementById('cliente-apellido').value, telefono: document.getElementById('cliente-telefono').value, email: document.getElementById('cliente-email').value || null, fecha_nacimiento: document.getElementById('cliente-fecha-nacimiento').value || null, notas: document.getElementById('cliente-notas').value || null }; let result; if (id) { result = await fetchData(`/api/clientes/${id}`, 'PUT', clienteData); } else { result = await fetchData('/api/clientes', 'POST', clienteData); } if (result) { alert(`¡Cliente ${id ? 'actualizado' : 'creado'} exitosamente!`); closeModal('modal-cliente'); if (views.clients.style.display === 'block') { cargarClientes(); } if (views['client-detail'].style.display === 'block' && id) { verCliente(id); } } });
        document.getElementById('form-barbero')?.addEventListener('submit', async (event) => {
            event.preventDefault();
            const id = document.getElementById('barbero-id').value;
            const barberoData = { nombre: document.getElementById('barbero-nombre').value, apellido: document.getElementById('barbero-apellido').value, celular: document.getElementById('barbero-celular').value || null, email: document.getElementById('barbero-email').value || null, tipo_pago: document.getElementById('barbero-tipo-pago').value, valor: document.getElementById('barbero-valor').value || null };
            let barberoResult = id ? await fetchData(`/api/barberos/${id}`, 'PUT', barberoData) : await fetchData('/api/barberos', 'POST', barberoData);
            if (barberoResult) {
                const fotoInput = document.getElementById('barbero-foto');
                if (fotoInput.files.length > 0) {
                    const formData = new FormData();
                    formData.append('foto', fotoInput.files[0]);
                    await fetchData(`/api/barberos/${barberoResult.barbero_id}/foto`, 'POST', formData);
                }
                alert(`¡Barbero ${id ? 'actualizado' : 'creado'} exitosamente!`);
                closeModal('modal-barbero');
                cargarBarberos();
            }
        });
        document.querySelector('.btn-upload[data-tipo="antes"]')?.addEventListener('click', async () => { const fileInput = document.getElementById('foto-antes-input'); if(fileInput.files.length > 0) { const formData = new FormData(); formData.append('foto', fileInput.files[0]); formData.append('tipo', 'antes'); const result = await fetchData(`/api/clientes/${currentClientId}/foto`, 'POST', formData); if(result) { alert(result.message); verCliente(currentClientId); } } });
        document.querySelector('.btn-upload[data-tipo="despues"]')?.addEventListener('click', async () => { const fileInput = document.getElementById('foto-despues-input'); if(fileInput.files.length > 0) { const formData = new FormData(); formData.append('foto', fileInput.files[0]); formData.append('tipo', 'despues'); const result = await fetchData(`/api/clientes/${currentClientId}/foto`, 'POST', formData); if(result) { alert(result.message); verCliente(currentClientId); } } });
    };
    
    showView('dashboard');
    cargarKPIs();
    cargarGraficoSemanal();
    cargarAlertaStock();
    setupEventListeners();
});
