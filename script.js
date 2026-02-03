
let globalListenerAdded = false;
let currentFilter = "active"; // padrão: mostrar apenas alunos ativos
let searchTerm = ""; // termo de pesquisa atual

function addGlobalEventListener() {
    if (globalListenerAdded) return;
    
    const studentList = document.getElementById('studentList');
    
    // Event delegation - um único listener para todos os checkboxes
    const debouncedChangeHandler = debounce(async (e) => {
        if (e.target.type === 'checkbox' && e.target.dataset.student) {
            const studentName = e.target.dataset.student;
            const field = e.target.dataset.field;
            const value = e.target.checked;
            
            // Atualização visual instantânea do checkbox
            e.target.style.transform = 'scale(1.1)';
            setTimeout(() => e.target.style.transform = 'scale(1)', 150);

            // ATUALIZAÇÃO INSTANTÂNEA VISUAL
            updateUIInstantly(studentName, field, value);
            
            // Mostrar indicador de salvamento
            showSaveStatus('saving', '💾 Salvando...');
            
            // Atualizar dados
            if (field === 'videocall' || field === 'sentToGroup') {
                await updateStudentWithExclusion(studentName, field, value);
            } else {
                await updateStudent(studentName, field, value);
            }
            
            // Atualizar gráfico imediatamente
            const week = document.getElementById('weekSelect').value;
            if (week !== 'general') {
                await updateChart();
            }
            
            // Atualizar lista (para pontuação)
            await updateStudentList();
            
            // Pequeno delay para garantir que o timestamp foi salvo
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Atualizar status do botão de upload APÓS salvar
            await updateLastUploadTime();
            
            // Mostrar sucesso
            showSaveStatus('success', '✅ Salvo!');
        }
    }, 50);
    
    // Handle select dropdown changes for presentation day
    studentList.addEventListener('change', async (e) => {
        if (e.target.classList.contains('presentation-day-select')) {
            const studentName = e.target.dataset.student;
            const value = e.target.value;

            // ATUALIZAÇÃO INSTANTÂNEA VISUAL
            // Mostrar indicador de salvamento
            showSaveStatus('saving', '💾 Salvando...');

            // Atualizar dados
            await updateStudent(studentName, 'presentationDay', value);

            // Atualizar lista (para sincronizar)
            await updateStudentList();

            // Pequeno delay para garantir que o timestamp foi salvo
            await new Promise(resolve => setTimeout(resolve, 100));

            // Atualizar status do botão de upload APÓS salvar
            await updateLastUploadTime();

            // Mostrar sucesso
            showSaveStatus('success', '✅ Salvo!');
        }
    });

    studentList.addEventListener('change', debouncedChangeHandler);
    
    // Event delegation para botões
    studentList.addEventListener('click', function(e) {
        const studentItem = e.target.closest('.student-item');
        if (!studentItem) return;
        
        const studentName = studentItem.dataset.studentName;
        
        if (e.target.classList.contains('edit-btn')) {
            editStudentName(studentName);
        } else if (e.target.classList.contains('delete-btn')) {
            deleteStudent(studentName);
        } else if (e.target.classList.contains('objective-btn') || e.target.closest('.objective-div')) {
            editObjective(studentName);
        }
    });
    
    globalListenerAdded = true;
}

// Dados iniciais
const defaultStudents = [
    { name: "Ana Silva", active: true, videocall: true, tuesday: true, thursday: true },
    { name: "Bruno Costa", active: true, videocall: true, tuesday: false, thursday: true },
    { name: "Carlos Mendes", active: true, videocall: false, tuesday: true, thursday: true },
    { name: "Diana Rocha", active: true, videocall: true, tuesday: true, thursday: false },
    { name: "Eduardo Lima", active: true, videocall: true, tuesday: true, thursday: true },
    { name: "Fernanda Alves", active: true, videocall: false, tuesday: false, thursday: true },
    { name: "Gabriel Santos", active: true, videocall: true, tuesday: true, thursday: true },
    { name: "Helena Martins", active: true, videocall: true, tuesday: false, thursday: false },
    { name: "Igor Pereira", active: true, videocall: false, tuesday: true, thursday: true },
    { name: "Julia Ferreira", active: true, videocall: true, tuesday: true, thursday: true }
];

// Variável global para File System
let directoryHandle = null;

// IndexedDB para persistência do directoryHandle
const DB_NAME = 'FileSystemPersistence';
const STORE_NAME = 'directoryHandles';
const DB_VERSION = 1;

async function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function saveDirectoryHandle(handle) {
    if (!handle) return;
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        await store.put({ id: 'directoryHandle', handle: handle, name: handle.name });
        localStorage.setItem('directoryHandleName', handle.name);
        sessionStorage.setItem('directoryHandleName', handle.name);
        
    } catch (err) {
        console.error('Erro ao salvar no IndexedDB:', err);
    }
}

async function restoreDirectoryHandle() {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.get('directoryHandle');
        return new Promise((resolve) => {
            request.onsuccess = async () => {
                const saved = request.result;
                if (saved?.handle) {
                    try {
                        // Verificar permissão
                        const permission = await saved.handle.queryPermission({ mode: 'readwrite' });
                        if (permission === 'granted') {
                            directoryHandle = saved.handle;
                            localStorage.setItem('directoryHandleName', saved.name);
                            sessionStorage.setItem('directoryHandleName', saved.name);
                            
                            showSaveStatus('success', `✅ Conectado a: ${saved.name}`);
                            updateFileSystemStatusFixed();
                            resolve(true);
                        } else if (permission === 'prompt') {
                            const granted = await saved.handle.requestPermission({ mode: 'readwrite' });
                            if (granted === 'granted') {
                                directoryHandle = saved.handle;
                                localStorage.setItem('directoryHandleName', saved.name);
                                sessionStorage.setItem('directoryHandleName', saved.name);
                                
                                showSaveStatus('success', `✅ Conectado a: ${saved.name}`);
                                updateFileSystemStatusFixed();
                                resolve(true);
                            } else {
                                console.log('Permissão negada.');
                                resolve(false);
                            }
                        } else {
                            console.log('Permissão não concedida.');
                            resolve(false);
                        }
                    } catch (err) {
                        console.error('Erro ao verificar diretório:', err);
                        showSaveStatus('error', `❌ Erro ao verificar diretório: ${err.message}`);
                        resolve(false);
                    }
                } else {
                    console.log('Nenhum diretório salvo encontrado.');
                    resolve(false);
                }
            };
            request.onerror = () => {
                console.error('Erro ao restaurar:', request.error);
                resolve(false);
            };
        });
    } catch (err) {
        console.error('Erro ao abrir IndexedDB:', err);
        return false;
    }
}

// Inicializar dados se não existirem
async function initData() {
   
    
    if (!(await loadJsonFile('months.json'))) {
        const defaultMonths = [
            { id: "2025-06", name: "Junho 2025", monthNumber: 6, year: 2025 },
            { id: "2025-05", name: "Maio 2025", monthNumber: 5, year: 2025 },
            { id: "2025-04", name: "Abril 2025", monthNumber: 4, year: 2025 }
        ];
        await saveJsonFile('months.json', defaultMonths);
    }
    
    if (!(await loadJsonFile('globalStudents.json'))) {
        const defaultStudents = [
            "Ana Silva", "Bruno Costa", "Carlos Mendes", "Diana Rocha", "Eduardo Lima",
            "Fernanda Alves", "Gabriel Santos", "Helena Martins", "Igor Pereira", "Julia Ferreira"
        ];
        await saveJsonFile('globalStudents.json', defaultStudents);
    }
}

// Carregar dados específicos de mês+semana
async function loadStudents() {
    const week = document.getElementById('weekSelect').value;

    if (week === 'general') {
        return [];  // Retorna array vazio no modo geral
    }

    const monthId = document.getElementById('monthSelect').value;
    const weekNum = document.getElementById('weekSelect').value;
    const fileName = `${monthId}-week${weekNum}.json`;

    const weekData = await loadJsonFile(`${monthId}-week${weekNum}.json`, {});

    // Retornar todos os alunos globais com seus dados da semana atual
    const globalStudents = await loadGlobalStudents();
    return globalStudents.map(name => {
        const student = weekData[name] || {
            name: name,
            active: false,
            videocall: false,
            sentToGroup: false,
            tuesday: false,
            thursday: false,
            apresentacaoSemanal: false,
            presentationDay: ''
        };

        // Adicionar campos se não existirem
        if (!student.objective) {
            student.objective = '';
        }
        if (student.sentToGroup === undefined) {
            student.sentToGroup = false;
        }
        if (student.apresentacaoSemanal === undefined) {
            student.apresentacaoSemanal = false;
        }
        if (!student.presentationDay) {
            student.presentationDay = '';
        }

        return student;
    });
}

// Carregar dados gerais do mês (todas as semanas)
async function loadMonthlyData() {
    const monthId = document.getElementById('monthSelect').value;
    const globalStudents = await loadGlobalStudents();
    
    // Coletar dados de todas as 4 semanas do mês
    const monthlyStats = {};
    
    globalStudents.forEach(name => {
        monthlyStats[name] = {
            name: name,
            weeks: [],
            totalScore: 0,
            weekCount: 0,
            objectiveCount: 0
        };
    });
    
    for (let week = 1; week <= 4; week++) {
        const fileName = `${monthId}-week${week}.json`;
        const weekData = await loadJsonFile(fileName, {});
        
        globalStudents.forEach(name => {
            const studentData = weekData[name] || {
                name: name,
                active: false,
                videocall: false,
                tuesday: false,
                thursday: false,
                objective: ''
            };
            
            const score = calculateScore(studentData);
            monthlyStats[name].weeks.push({
                week: week,
                score: score,
                active: studentData.active
            });
            
            // MUDANÇA: Sempre somar o score (0 se inativo) e sempre contar a semana
            monthlyStats[name].totalScore += score;
            monthlyStats[name].weekCount++;
            
            if (studentData.objective?.trim()) {
                monthlyStats[name].objectiveCount++;
            }
        });
    }
    
    // Calcular médias - agora sempre divide por 4 semanas
    Object.values(monthlyStats).forEach(student => {
        student.averageScore = Math.round(student.totalScore / 4);
    });

    return Object.values(monthlyStats);
}

// Salvar dados específicos de mês+semana
async function saveStudents(students) {
    const monthId = document.getElementById('monthSelect').value;
    const week = document.getElementById('weekSelect').value;
    const fileName = `${monthId}-week${week}.json`;
    
    const weekData = {};
    students.forEach(student => {
        weekData[student.name] = student;
    });
    
    const success = await saveJsonFile(fileName, weekData);
    if (success) {
        await updateStudentList();
        await updateLastUploadTime(); // Atualizar botão
    }
}

// Calcular pontuação
const calculateScore = (function() {
    const cache = new Map();
    return function(student) {
        if (!student.active) return 0;

        // Obter mês selecionado
        const monthSelect = document.getElementById('monthSelect');
        const selectedMonth = monthSelect ? monthSelect.value : '';

        // Verificar se é janeiro de 2026 ou posterior
        const isNewSystem = selectedMonth && selectedMonth >= '2026-01';

        // Criar chave de cache diferente para cada sistema
        const key = isNewSystem
            ? `${student.name}-${student.videocall}-${student.sentToGroup}-${student.apresentacaoSemanal}-${student.objective}-new`
            : `${student.name}-${student.videocall}-${student.sentToGroup}-${student.tuesday}-${student.thursday}-${student.objective}-old`;

        if (cache.has(key)) {
            return cache.get(key);
        }

        let score = 0;

        if (isNewSystem) {
            // Sistema novo (≥ janeiro 2026): videochamada/grupo + apresentação semanal + objetivo = 100%
            // Cada item vale 33.33%
            if (student.videocall || student.sentToGroup) score += 33.33;
            if (student.apresentacaoSemanal) score += 33.33; // Novo campo apresentacaoSemanal
            if (student.objective?.trim()) score += 33.33;
        } else {
            // Sistema antigo (< janeiro 2026): videochamada/grupo + terça + quinta + objetivo
            if (student.videocall || student.sentToGroup) score += 25;
            if (student.tuesday) score += 25;
            if (student.thursday) score += 25;
            if (student.objective?.trim()) score += 25;
        }

        const result = Math.round(score);
        cache.set(key, result);
        return result;
    };
})();

// Carregar meses salvos
async function loadMonths() {
    
    const defaultMonths = [
        { id: "2025-06", name: "Junho 2025", monthNumber: 6, year: 2025 },
        { id: "2025-05", name: "Maio 2025", monthNumber: 5, year: 2025 },
        { id: "2025-04", name: "Abril 2025", monthNumber: 4, year: 2025 }
    ];
    return await loadJsonFile('months.json', defaultMonths);
}

// Salvar meses
async function saveMonths(months) {
    
    const success = await saveJsonFile('months.json', months);
}
// Carregar lista global de alunos
async function loadGlobalStudents() {
    const defaultStudents = [
        "Ana Silva", "Bruno Costa", "Carlos Mendes", "Diana Rocha", "Eduardo Lima",
        "Fernanda Alves", "Gabriel Santos", "Helena Martins", "Igor Pereira", "Julia Ferreira"
    ];
    return await loadJsonFile('globalStudents.json', defaultStudents);
}

// Salvar lista global de alunos
async function saveGlobalStudents(students) {
    const success = await saveJsonFile('globalStudents.json', students);
}

// Verificar se aluno já existe globalmente
async function studentExists(name) {
    const globalStudents = await loadGlobalStudents();
    return globalStudents.some(student => 
        student.toLowerCase().trim() === name.toLowerCase().trim()
    );
}

// Atualizar select de meses
async function updateMonthSelect() {
    const months = await loadMonths();
    const monthSelect = document.getElementById('monthSelect');
    const currentValue = monthSelect.value;
    
    monthSelect.innerHTML = '';
    months.forEach(month => {
        const option = new Option(month.name, month.id);
        monthSelect.add(option);
    });
    
    // Restaurar seleção se ainda existir
    if (currentValue && months.find(m => m.id === currentValue)) {
        monthSelect.value = currentValue;
    }
}

// Atualizar gráfico
async function updateChart() {
    const week = document.getElementById('weekSelect').value;
    const chart = document.getElementById('chart');
    
    // Criar fragmento para minimizar manipulações do DOM
    const fragment = document.createDocumentFragment();
    
    if (week === 'general') {
        invalidateFileCache('months.json');
        const monthlyData = await loadMonthlyData();
        console.log('Dados de loadMonthlyData:', JSON.stringify(monthlyData, null, 2));
        monthlyData
            .filter(student => student.averageScore > 0)
            .sort((a, b) => {
                if (b.averageScore !== a.averageScore) return b.averageScore - a.averageScore;
                return a.name.localeCompare(b.name);
            })
            .forEach(student => {
                const bar = document.createElement('div');
                bar.className = 'bar';
                
                const barFill = document.createElement('div');
                barFill.className = 'bar-fill';
                barFill.style.height = `${Math.max(student.averageScore * 2.5, 20)}px`;
                
                if (student.averageScore >= 80) {
                    barFill.classList.add('high');
                    if (student.averageScore === 100) {
                        const star = document.createElement('div');
                        star.className = 'star';
                        star.textContent = '⭐';
                        bar.appendChild(star);
                    }
                } else if (student.averageScore >= 50) {
                    barFill.classList.add('medium');
                } else {
                    barFill.classList.add('low');
                }
                
                barFill.textContent = `${student.averageScore}%`;
                
                const barName = document.createElement('div');
                barName.className = 'bar-name';
                barName.textContent = student.name;
                
                bar.appendChild(barFill);
                bar.appendChild(barName);
                fragment.appendChild(bar);
            });
    } else {
        const students = (await loadStudents()).filter(s => s.active);
        // Em updateChart, substitua a ordenação no modo de semana específica
        students.sort((a, b) => {
            const scoreA = calculateScore(a);
            const scoreB = calculateScore(b);
            if (scoreB !== scoreA) return scoreB - scoreA;
            return a.name.localeCompare(b.name);
        });
        
        students.forEach(student => {
            const score = calculateScore(student);
            const bar = document.createElement('div');
            bar.className = 'bar';
            
            const barFill = document.createElement('div');
            barFill.className = 'bar-fill';
            barFill.style.height = `${Math.max(score * 2.5, 20)}px`;
            
            if (score >= 80) {
                barFill.classList.add('high');
                if (score === 100) {
                    const star = document.createElement('div');
                    star.className = 'star';
                    star.textContent = '⭐';
                    bar.appendChild(star);
                }
            } else if (score >= 50) {
                barFill.classList.add('medium');
            } else {
                barFill.classList.add('low');
            }
            
            barFill.textContent = `${score}%`;
            
            const barName = document.createElement('div');
            barName.className = 'bar-name';
            barName.textContent = student.name;
            
            bar.appendChild(barFill);
            bar.appendChild(barName);
            fragment.appendChild(bar);
        });
    }
    
    // Limpar e adicionar ao DOM de uma vez
    chart.innerHTML = '';
    chart.appendChild(fragment);
}

// Atualizar lista de alunos no painel produtor
async function updateStudentList() {
    // Adicionar listeners globais apenas uma vez
    addGlobalEventListener();

    updateStudentObjectiveSelect();
    let students = await loadStudents();

    // aplicar filtro
    if (currentFilter === "active") {
        students = students.filter(s => s.active);
    } else if (currentFilter === "inactive") {
        students = students.filter(s => !s.active);
    }

    // aplicar filtro de pesquisa
    if (searchTerm) {
        students = students.filter(s =>
            normalizeText(s.name).includes(searchTerm)
        );
    }

    students.sort((a, b) => a.name.localeCompare(b.name));

    const studentList = document.getElementById('studentList');
    studentList.innerHTML = '';

    // Verificar se é janeiro de 2026 ou posterior
    const monthSelect = document.getElementById('monthSelect');
    const selectedMonth = monthSelect ? monthSelect.value : '';
    const isNewSystem = selectedMonth && selectedMonth >= '2026-01';

    students.forEach((student, index) => {
        const studentItem = document.createElement('div');
        studentItem.className = 'student-item';
        studentItem.dataset.studentName = student.name; // Importante para event delegation
        const score = calculateScore(student);

        // Gerar HTML condicionalmente
        let checkboxesHTML = `
            <div class="checkbox-item">
                <input type="checkbox" id="active-${index}" data-field="active" data-student="${student.name}" ${student.active ? 'checked' : ''}>
                <label for="active-${index}">Ativo</label>
            </div>
            <div class="checkbox-item">
                <input type="checkbox" id="videocall-${index}" data-field="videocall" data-student="${student.name}" ${student.videocall ? 'checked' : ''}>
                <label for="videocall-${index}">Videochamada</label>
            </div>
            <div class="checkbox-item">
                <input type="checkbox" id="sentToGroup-${index}" data-field="sentToGroup" data-student="${student.name}" ${student.sentToGroup ? 'checked' : ''}>
                <label for="sentToGroup-${index}">Mandou no grupo</label>
            </div>
        `;

        if (isNewSystem) {
            // Sistema novo: mostrar apenas Apresentação Semanal
            checkboxesHTML += `
                <div class="checkbox-item">
                    <input type="checkbox" id="apresentacaoSemanal-${index}" data-field="apresentacaoSemanal" data-student="${student.name}" ${student.apresentacaoSemanal ? 'checked' : ''}>
                    <label for="apresentacaoSemanal-${index}">Apresentação Semanal</label>
                </div>
            `;
        } else {
            // Sistema antigo: mostrar Terça e Quinta
            checkboxesHTML += `
                <div class="checkbox-item">
                    <input type="checkbox" id="tuesday-${index}" data-field="tuesday" data-student="${student.name}" ${student.tuesday ? 'checked' : ''}>
                    <label for="tuesday-${index}">Terça</label>
                </div>
                <div class="checkbox-item">
                    <input type="checkbox" id="thursday-${index}" data-field="thursday" data-student="${student.name}" ${student.thursday ? 'checked' : ''}>
                    <label for="thursday-${index}">Quinta</label>
                </div>
            `;
        }

        // Dropdown para dia de apresentação
        const presentationDayOptions = ['', 'Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta'];
        let presentationDayHTML = `<select class="presentation-day-select" data-student="${student.name}">`;
        presentationDayOptions.forEach(day => {
            const selected = student.presentationDay === day ? 'selected' : '';
            presentationDayHTML += `<option value="${day}" ${selected}>${day || 'Selecionar dia'}</option>`;
        });
        presentationDayHTML += `</select>`;

        studentItem.innerHTML = `
            <div class="student-header">
                <div style="display: flex; align-items: center; gap: 15px; flex-wrap: wrap;">
                    <span class="student-name">${student.name}</span>
                    <div style="color: #888; font-size: 0.9em;">Dia da apresentação: ${presentationDayHTML}</div>
                    <div class="checkboxes" style="display: flex; gap: 10px; flex-wrap: wrap;">
                        ${checkboxesHTML}
                    </div>
                </div>
                <div class="student-actions">
                    ${!student.objective ? `<button class="icon-btn objective-btn" title="Adicionar objetivo" style="width: 25px; height: 25px; font-size: 10px;">🎯</button>` : ''}
                    <button class="icon-btn edit-btn" title="Editar nome" style="width: 25px; height: 25px; font-size: 10px;">✏️</button>
                    <button class="icon-btn delete-btn" title="Apagar aluno" style="width: 25px; height: 25px; font-size: 10px; background: linear-gradient(45deg, #ef4444, #dc2626);">🗑️</button>
                    <span class="student-score">${score}%</span>
                </div>
            </div>
            ${student.objective ? `<div class="objective-div" style="background: rgba(74, 172, 254, 0.2); padding: 8px; border-radius: 8px; margin: 8px 0; border-left: 3px solid #4facfe; cursor: pointer; transition: background 0.2s ease;" title="Clique para editar objetivo"><strong>🎯 Objetivo:</strong> ${student.objective}</div>` : ''}
        `;

        studentList.appendChild(studentItem);
        updateWeeklySummary();
    });
}

function countStudentItems(student) {
    let count = 0;
    if (student.videocall || student.sentToGroup) count++;
    if (student.tuesday) count++;
    if (student.thursday) count++;
    if (student.objective?.trim()) count++;
    return count;
}

// Atualizar detalhes dos alunos
async function updateDetails() {
    const week = document.getElementById('weekSelect').value;
    const detailsGrid = document.getElementById('detailsGrid');
    const detailsTitle = document.querySelector('.student-details h3');

    // Verificar se é janeiro de 2026 ou posterior
    const monthSelect = document.getElementById('monthSelect');
    const selectedMonth = monthSelect ? monthSelect.value : '';
    const isNewSystem = selectedMonth && selectedMonth >= '2026-01';

    if (week === 'general') {
        detailsTitle.textContent = '📊 Resumo Mensal';
        const monthlyData = await loadMonthlyData();

        if (monthlyData.length === 0 || monthlyData.every(s => s.averageScore === 0)) {
            detailsGrid.innerHTML = '<p style="text-align: center; color: #888;">Nenhum dado para este mês</p>';
            return;
        }

        detailsGrid.innerHTML = '';

        monthlyData
            .filter(student => student.averageScore > 0)
            .sort((a, b) => {
                if (b.weekCount !== a.weekCount) return b.weekCount - a.weekCount;
                if (b.objectiveCount !== a.objectiveCount) return b.objectiveCount - a.objectiveCount;
                if (b.averageScore !== a.averageScore) return b.averageScore - a.averageScore;
                return a.name.localeCompare(b.name);
            })
            .forEach(student => {
                const detailItem = document.createElement('div');
                detailItem.className = 'detail-item';

                const weeksInfo = student.weeks
                    .map(w => `S${w.week}: ${w.score}%${w.active ? '' : ' (inativo)'}`)
                    .join(' | ');

                detailItem.innerHTML = `
                    <div class="detail-name">${student.name} - Média: ${student.averageScore}%</div>
                    <div class="detail-activities">
                        <span class="activity-summary">
                            📈 ${student.weeks.filter(w => w.active).length}/4 semanas ativas
                        </span>
                        <span class="activity-summary">
                            🎯 ${student.objectiveCount} objetivo(s)
                        </span>
                        <span class="activity-summary">
                            ${weeksInfo || 'Sem dados'}
                        </span>
                    </div>
                `;

                detailsGrid.appendChild(detailItem);
            });
    } else {
        // Modo semana individual
        detailsTitle.textContent = '📊 Detalhes dos Alunos';
        const students = (await loadStudents()).filter(s => s.active);

        const activeStudents = students
            .filter(s => s.active)
            .sort((a, b) => {
                const countA = countStudentItems(a);
                const countB = countStudentItems(b);
                return countB - countA || a.name.localeCompare(b.name);
            });

        if (activeStudents.length === 0) {
            detailsGrid.innerHTML = '<p style="text-align: center; color: #888;">Nenhum aluno ativo para esta semana</p>';
            return;
        }

        detailsGrid.innerHTML = '';

        activeStudents.forEach(student => {
            const detailItem = document.createElement('div');
            detailItem.className = 'detail-item';

            const score = calculateScore(student);

            let activitiesHTML = `
                <span class="activity ${(student.videocall || student.sentToGroup) ? 'done' : 'not-done'}">
                    ${student.videocall ? '✅ Videochamada' :
                    student.sentToGroup ? '✅ Mandou no grupo' :
                    '❌ Videochamada / Mandou no grupo'}
                </span>
            `;

            if (isNewSystem) {
                // Sistema novo: mostrar Apresentação Semanal
                activitiesHTML += `
                    <span class="activity ${student.apresentacaoSemanal ? 'done' : 'not-done'}">
                        ${student.apresentacaoSemanal ? '✅' : '❌'} Apresentação Semanal
                    </span>
                `;
            } else {
                // Sistema antigo: mostrar Terça e Quinta
                activitiesHTML += `
                    <span class="activity ${student.tuesday ? 'done' : 'not-done'}">
                        ${student.tuesday ? '✅' : '❌'} Terça
                    </span>
                    <span class="activity ${student.thursday ? 'done' : 'not-done'}">
                        ${student.thursday ? '✅' : '❌'} Quinta
                    </span>
                `;
            }

            detailItem.innerHTML = `
                <div class="detail-name">${student.name} - ${score}%</div>
                ${student.objective ? `<div style="background: rgba(74, 172, 254, 0.2); padding: 8px; border-radius: 8px; margin: 8px 0; border-left: 3px solid #4facfe; font-size: 0.9em;"><strong>🎯 Objetivo:</strong> ${student.objective}</div>` : ''}
                <div class="detail-activities">
                    ${activitiesHTML}
                </div>
            `;

            detailsGrid.appendChild(detailItem);
        });
    }
}

// Atualizar aluno
async function updateStudent(studentName, field, value) {
    const students = await loadStudents();
    const student = students.find(s => s.name === studentName);
    if (student) {
        student[field] = value;
        await saveStudents(students); // Salva apenas uma vez
    } else {
        console.error(`Aluno ${studentName} não encontrado`);
    }
}


// Adicionar aluno
async function addStudent() {
    const nameInput = document.getElementById('newStudentName');
    const name = nameInput.value.trim();
    
    if (!name) {
        nameInput.style.borderColor = '#ef4444';
        nameInput.style.boxShadow = '0 0 5px rgba(239, 68, 68, 0.5)';
        setTimeout(() => {
            nameInput.style.borderColor = '#4a5568';
            nameInput.style.boxShadow = 'none';
        }, 1000);
        return;
    }
    
    // Verificar duplicata instantaneamente
    const globalStudents = await loadGlobalStudents();
    if (globalStudents.some(student => 
        student.toLowerCase().trim() === name.toLowerCase().trim()
    )) {
        nameInput.style.borderColor = '#ef4444';
        showSaveStatus('error', '❌ Este aluno já está cadastrado no sistema!');
        return;
    }
    
    // ATUALIZAÇÃO VISUAL INSTANTÂNEA
    nameInput.value = '';
    nameInput.style.borderColor = '#10b981';
    
    // Adicionar aluno visualmente à lista IMEDIATAMENTE
    addStudentToListInstantly(name);
    
    showSaveStatus('saving', '💾 Salvando...');
    
    // Salvar em background
    globalStudents.push(name);
    await saveGlobalStudents(globalStudents);
    
    // Salvar dados do aluno como ativo por padrão
    const students = await loadStudents();
    const newStudent = {
        name: name,
        active: true,
        videocall: false,
        sentToGroup: false,
        tuesday: false,
        thursday: false,
        objective: '',
        presentationDay: ''
    };
    students.push(newStudent);
    await saveStudents(students);
    
    showSaveStatus('success', '✅ Aluno adicionado!');
    nameInput.style.borderColor = '#4a5568';
}

// Toggle modo produtor [apaguei essa]


// Função para listar conteúdo das pastas
async function listDirectoryContents() {
    if (!directoryHandle) {
        showSaveStatus('error', '❌ Configure o sistema de arquivos primeiro!');
        return;
    }
    
    try {
        let report = '📁 ESTRUTURA DE ARQUIVOS:\n\n';
        
        // Listar arquivos na raiz
        report += '📂 Raiz:\n';
        for await (const [name, handle] of directoryHandle.entries()) {
            if (handle.kind === 'file') {
                report += `  📄 ${name}\n`;
            }
        }
        
        // Listar pasta config
        try {
            const configHandle = await directoryHandle.getDirectoryHandle('config');
            report += '\n📂 config/:\n';
            for await (const [name, handle] of configHandle.entries()) {
                if (handle.kind === 'file') {
                    report += `  📄 ${name}\n`;
                }
            }
        } catch (err) {
            report += '\n📂 config/: (não encontrada)\n';
        }
        
        // Listar pasta meses
        try {
            const mesesHandle = await directoryHandle.getDirectoryHandle('meses');
            report += '\n📂 meses/:\n';
            for await (const [monthName, monthHandle] of mesesHandle.entries()) {
                if (monthHandle.kind === 'directory') {
                    report += `  📂 ${monthName}/:\n`;
                    for await (const [fileName, fileHandle] of monthHandle.entries()) {
                        if (fileHandle.kind === 'file') {
                            report += `    📄 ${fileName}\n`;
                        }
                    }
                }
            }
        } catch (err) {
            report += '\n📂 meses/: (não encontrada)\n';
        }
        
        alert(report);
    } catch (err) {
        showSaveStatus('error', `❌ Erro ao listar: ${err.message}`);
    }
}

// Função para limpar dados de um mês
async function clearMonthData() {
    if (!directoryHandle) {
        alert('Configure o sistema de arquivos primeiro!');
        return;
    }
    
    const monthId = document.getElementById('monthSelect').value;
    if (!monthId) {
        showSaveStatus('error', '❌ Selecione um mês!');
        return;
    }
    
    const months = await loadMonths();
    const month = months.find(m => m.id === monthId);
    
    if (!confirm(`Limpar TODOS os dados de "${month.name}"?\nIsso não pode ser desfeito!`)) {
        return;
    }
    
    try {
        const mesesHandle = await directoryHandle.getDirectoryHandle('meses');
        const monthHandle = await mesesHandle.getDirectoryHandle(monthId);
        
        // Limpar todos os arquivos da pasta do mês
        for await (const [fileName, fileHandle] of monthHandle.entries()) {
            if (fileHandle.kind === 'file') {
                await monthHandle.removeEntry(fileName);
            }
        }
        
        showSaveStatus('success', `✅ Dados de ${month.name} limpos!`);
        await updateChart();
        await updateDetails();
        if (document.getElementById('producerPanel').classList.contains('active')) {
            await updateStudentList();
        }
    } catch (err) {
        showSaveStatus('error', `❌ Erro ao limpar: ${err.message}`);
    }
}

// Função para limpar todos os dados
async function clearAllData() {
    if (!directoryHandle) {
        alert('Configure o sistema de arquivos primeiro!');
        return;
    }
    
    if (!confirm('⚠️ ATENÇÃO: Isso vai apagar TODOS os dados!\n\nTem certeza?')) {
        return;
    }
    
    if (!confirm('🚨 ÚLTIMA CHANCE!\n\nIsso vai apagar PERMANENTEMENTE todos os meses, alunos e configurações!\n\nContinuar?')) {
        return;
    }
    
    try {
        // Limpar pasta config
        try {
            const configHandle = await directoryHandle.getDirectoryHandle('config');
            for await (const [fileName, fileHandle] of configHandle.entries()) {
                if (fileHandle.kind === 'file') {
                    await configHandle.removeEntry(fileName);
                }
            }
        } catch (err) {
            console.log('Pasta config não encontrada');
        }
        
        // Limpar pasta meses
        try {
            const mesesHandle = await directoryHandle.getDirectoryHandle('meses');
            for await (const [monthName, monthHandle] of mesesHandle.entries()) {
                if (monthHandle.kind === 'directory') {
                    // Limpar arquivos da pasta do mês
                    for await (const [fileName, fileHandle] of monthHandle.entries()) {
                        if (fileHandle.kind === 'file') {
                            await monthHandle.removeEntry(fileName);
                        }
                    }
                    // Remover a pasta do mês
                    await mesesHandle.removeEntry(monthName);
                }
            }
        } catch (err) {
            console.log('Pasta meses não encontrada');
        }
        
        // Limpar dados da memória também
        memoryStorage = {};
        
        // Reinicializar dados padrão
        await initData();
        await updateMonthSelect();
        await updateChart();
        await updateDetails();
        
        showSaveStatus('success', '✅ Todos os dados foram limpos!');
        
    } catch (err) {
        showSaveStatus('error', `❌ Erro ao limpar: ${err.message}`);
    }
}

// Ajustar posição da weekly-summary quando section-header fica sticky
function adjustWeeklySummaryPosition() {
    const sectionHeader = document.querySelector('.section-header');
    const weeklySummary = document.querySelector('.weekly-summary');
    
    if (sectionHeader && weeklySummary) {
        const headerRect = sectionHeader.getBoundingClientRect();
        const isSticky = headerRect.top === 0;
        
        if (isSticky) {
            const headerHeight = sectionHeader.offsetHeight;
            weeklySummary.style.top = `${headerHeight + 20}px`;
        } else {
            weeklySummary.style.top = '20px';
        }
    }
}

// Executar ao rolar a página
window.addEventListener('scroll', adjustWeeklySummaryPosition);
// Executar ao carregar
window.addEventListener('load', adjustWeeklySummaryPosition);
// Ctrl+F para focar no campo de pesquisa de alunos
document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        const searchInput = document.getElementById('searchStudents');
        if (searchInput) {
            searchInput.focus();
            searchInput.select();
        }
    }
});
// Event listeners

document.getElementById('newStudentName').addEventListener('keypress', async function(e) {
    if (e.key === 'Enter') {
        await addStudent();
    }
});
document.getElementById('studentObjectiveSelect').addEventListener('keypress', async function(e) {
    if (e.key === 'Enter') {
        e.preventDefault(); // Evita abrir a lista suspensa
        const objectiveText = document.getElementById('objectiveText').value.trim();
        const studentSelected = this.value;
        
        if (objectiveText && studentSelected) {
            await addObjective();
        }
    }
});

// Event listener para copyFromPreviousWeek (com verificação)
const copyBtn = document.getElementById('copyFromPreviousWeekBtn');
if (copyBtn) {
    copyBtn.addEventListener('click', copyFromPreviousWeek);
}

document.getElementById('setupFileSystemBtn').addEventListener('click', setupFileSystem);

// Adicionar depois dos outros event listeners


// Inicializar
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM carregado, inicializando app...');
    const mainContent = document.querySelector('main') || document.body;
    const setupBtn = document.getElementById('setupFileSystemBtn');
    
    const restored = await restoreDirectoryHandle();
    if (restored && directoryHandle) {
        setupBtn.style.display = 'none';
        mainContent.style.display = 'block';
        await initData();
        await updateMonthSelect();
        await loadViewState();
        await updateChart();
        await updateDetails();
        if (!window.location.pathname.includes('aluno.html')) {
            await updateStudentList();
        }
        updateFileSystemStatusFixed();
        
        await updateLastUploadTime();
    } else {
        setupBtn.style.display = 'block';
        mainContent.style.display = 'none';
        showSaveStatus('warning', '⚠️ Configure o sistema de arquivos para começar');
    }
});
// 3. ADICIONE event listeners para salvar quando mudar:
document.getElementById('monthSelect').addEventListener('change', async function() {
    // Forçar seleção da aba "geral" quando mudar mês
    document.getElementById('weekSelect').value = 'general';
    
    await onMonthOrWeekChange();
    await saveViewState();
});

document.getElementById('weekSelect').addEventListener('change', async function() {
    await onMonthOrWeekChange();  
    await saveViewState();
});

// Função para adicionar mês
async function addMonth() {
    const monthName = prompt("Nome do mês (ex: Julho 2025):");
    if (!monthName?.trim()) return;

    const monthNumber = parseInt(prompt("Número do mês (1-12):"));
    const year = parseInt(prompt("Ano (ex: 2025):"));
    
    if (monthNumber < 1 || monthNumber > 12 || !year) {
        showSaveStatus('error', '❌ Mês (1-12) e ano válidos!');
        return;
    }

    const months = await loadMonths();
    const newMonth = {
        id: `${year}-${monthNumber.toString().padStart(2, '0')}`,
        name: monthName.trim(),
        monthNumber,
        year
    };

    if (months.some(m => m.id === newMonth.id)) {
        showSaveStatus('error', '❌ Mês já existe!');
        return;
    }

    months.push(newMonth);
    months.sort((a, b) => b.year - a.year || b.monthNumber - a.monthNumber);
    
    await saveMonths(months);
    await updateMonthSelect();
    document.getElementById('monthSelect').value = newMonth.id;
    await onMonthOrWeekChange();
}

// 3. NOVA função para encontrar mês anterior:
async function getPreviousMonth(currentMonthId) {
    const months = await loadMonths();
    const currentMonth = months.find(m => m.id === currentMonthId);
    
    if (!currentMonth) return null;
    
    let previousMonthNumber = currentMonth.monthNumber - 1;
    let previousYear = currentMonth.year;
    
    // Se é janeiro, vai para dezembro do ano anterior
    if (previousMonthNumber === 0) {
        previousMonthNumber = 12;
        previousYear--;
    }
    
    // Procurar o mês anterior na lista
    const previousMonth = months.find(m => 
        m.monthNumber === previousMonthNumber && m.year === previousYear
    );
    
    return previousMonth;
}

// Função para editar mês
async function editMonth() {
    const monthSelect = document.getElementById('monthSelect');
    const selectedValue = monthSelect.value;
    
    if (!selectedValue) {
        showSaveStatus('error', '❌ Selecione um mês!');
        return;
    }
    
    const months = await loadMonths();
    const monthToEdit = months.find(m => m.id === selectedValue);
    
    if (!monthToEdit) {
        showSaveStatus('error', '❌ Mês não encontrado!');
        return;
    }
    
    const newName = prompt("Nome do mês:", monthToEdit.name);
    if (!newName?.trim()) return;
    
    const newMonthNumber = parseInt(prompt("Número do mês (1-12):", monthToEdit.monthNumber));
    if (isNaN(newMonthNumber) || newMonthNumber < 1 || newMonthNumber > 12) {
        showSaveStatus('error', '❌ Mês deve ser 1-12!');
        return;
    }
    
    const newYear = parseInt(prompt("Ano:", monthToEdit.year));
    if (isNaN(newYear) || newYear < 1900 || newYear > 2100) {
        showSaveStatus('error', '❌ Ano inválido!');
        return;
    }
    
    const newId = `${newYear}-${newMonthNumber.toString().padStart(2, '0')}`;
    
    if (newId !== selectedValue && months.some(m => m.id === newId)) {
        showSaveStatus('error', '❌ Data já existe!');
        return;
    }
    
    if (newId !== selectedValue) {
        for (let week = 1; week <= 4; week++) {
            const oldFileName = `${selectedValue}-week${week}.json`;
            const newFileName = `${newId}-week${week}.json`;
            const oldData = await loadJsonFile(oldFileName, {});
            if (Object.keys(oldData).length > 0) {
                await saveJsonFile(newFileName, oldData);
                await saveJsonFile(oldFileName, {});
            }
        }
    }
    
    monthToEdit.id = newId;
    monthToEdit.name = newName.trim();
    monthToEdit.monthNumber = newMonthNumber;
    monthToEdit.year = newYear;
    
    months.sort((a, b) => b.year - a.year || b.monthNumber - a.monthNumber);
    
    await saveMonths(months);
    await updateMonthSelect();
    document.getElementById('monthSelect').value = newId;
    await saveViewState();
    showSaveStatus('success', '✅ Mês editado!');
}

// Função para excluir mês
async function deleteMonth() {
    const monthSelect = document.getElementById('monthSelect');
    const selectedValue = monthSelect.value;
    
    if (!selectedValue) {
        showSaveStatus('error', '❌ Selecione um mês!');
        return;
    }
    
    const months = await loadMonths();
    if (months.length <= 1) {
        showSaveStatus('error', '❌ Não pode excluir o último mês!');
        return;
    }
    
    const monthToDelete = months.find(m => m.id === selectedValue);
    if (!monthToDelete) {
        showSaveStatus('error', '❌ Mês não encontrado!');
        return;
    }
    
    if (!confirm(`Excluir "${monthToDelete.name}"? TODOS OS DADOS serão perdidos!`)) return;
    
    for (let week = 1; week <= 4; week++) {
        const fileName = `${selectedValue}-week${week}.json`;
        await saveJsonFile(fileName, {});
    }
    
    const updatedMonths = months.filter(m => m.id !== selectedValue);
    await saveMonths(updatedMonths);
    await updateMonthSelect();
    
    const firstMonth = updatedMonths[0];
    if (firstMonth) {
        document.getElementById('monthSelect').value = firstMonth.id;
        document.getElementById('weekSelect').value = 'general';
        await onMonthOrWeekChange();
        await saveViewState();
    }
    
    showSaveStatus('success', '✅ Mês excluído!');
}

// Função chamada quando mês ou semana mudam
const debouncedUpdate = debounce(async () => {
    await updateChart();
    await updateDetails();
    await updateStudentList();
}, 100);

async function onMonthOrWeekChange() {
    invalidateFileCache(`${document.getElementById('monthSelect').value}-week${document.getElementById('weekSelect').value}.json`);
    await debouncedUpdate();
    await updateWeeklySummary();
}

// 4. NOVA função copyFromPreviousWeek melhorada:
async function copyFromPreviousWeek() {
    const monthId = document.getElementById('monthSelect').value;
    const currentWeek = parseInt(document.getElementById('weekSelect').value);
    
    let previousWeekKey;
    if (currentWeek === 1) {
        const previousMonth = await getPreviousMonth(monthId);
        if (!previousMonth) {
            showSaveStatus('error', '❌ Mês anterior não encontrado!');
            return;
        }
        previousWeekKey = `${previousMonth.id}-week4`;
    } else {
        previousWeekKey = `${monthId}-week${currentWeek - 1}`;
    }
    
    const currentWeekKey = `${monthId}-week${currentWeek}`;
    const previousWeekData = await loadJsonFile(previousWeekKey + '.json', {});
    
    if (Object.keys(previousWeekData).length === 0) {
        showSaveStatus('error', '❌ Sem dados na semana anterior!');
        return;
    }
    
    const globalStudents = await loadGlobalStudents();
    const currentWeekData = {};
    
    globalStudents.forEach(name => {
        const previousStudent = previousWeekData[name];
        currentWeekData[name] = {
            name,
            active: previousStudent ? previousStudent.active : false,
            videocall: false,
            tuesday: false,
            thursday: false,
            sentToGroup: false,
            objective: previousStudent?.objective || '',
            presentationDay: previousStudent?.presentationDay || ''
        };
    });
    
    await saveJsonFile(currentWeekKey + '.json', currentWeekData);
    await updateChart();
    await updateDetails();
    await updateStudentList();
    showSaveStatus('success', '✅ Dados copiados!');
}

// Adicionar feedback visual para botões de ação
function addButtonFeedback(buttonId, action) {
    const button = document.getElementById(buttonId);
    if (!button) return;
    
    const originalClickHandler = button.onclick;
    button.addEventListener('click', function(e) {
        // Feedback visual imediato
        this.style.transform = 'scale(0.95)';
        this.style.opacity = '0.8';
        
        setTimeout(() => {
            this.style.transform = 'scale(1)';
            this.style.opacity = '1';
        }, 150);
        
        if (originalClickHandler) {
            originalClickHandler.call(this, e);
        }
    });
}

// Aplicar feedback em botões importantes
['addMonthBtn', 'editMonthBtn', 'deleteMonthBtn', 'listFilesBtn', 'clearMonthBtn', 'clearAllBtn'].forEach(id => {
    addButtonFeedback(id);
});

// Event listeners para os botões
document.getElementById('addMonthBtn').addEventListener('click', addMonth);
document.getElementById('editMonthBtn').addEventListener('click', editMonth);
document.getElementById('deleteMonthBtn').addEventListener('click', deleteMonth);

// Salvar estado atual da visualização
async function saveViewState() {
    const viewState = {
        selectedMonth: document.getElementById('monthSelect').value,
        selectedWeek: document.getElementById('weekSelect').value,
        detailsView: document.getElementById('detailsGrid').parentElement.classList.contains('active')
    };
    await saveJsonFile('viewState.json', viewState);
}

// Carregar estado salvo da visualização
async function loadViewState() {
    const viewState = await loadJsonFile('viewState.json', {});
    const monthSelect = document.getElementById('monthSelect');
    const weekSelect = document.getElementById('weekSelect');

    if (viewState.selectedMonth && monthSelect.querySelector(`option[value="${viewState.selectedMonth}"]`)) {
        monthSelect.value = viewState.selectedMonth;
    } else {
        const months = await loadMonths();
        if (months.length > 0) {
            monthSelect.value = months[0].id;
        }
    }

    if (viewState.selectedWeek) {
        weekSelect.value = viewState.selectedWeek;
    } else {
        weekSelect.value = 'general';
    }

    if (viewState.detailsView) {
        const producerPanel = document.getElementById('producerPanel');
        const detailsPanel = document.getElementById('detailsGrid')?.parentElement;
        if (producerPanel && detailsPanel) {
            producerPanel.classList.remove('active');
            detailsPanel.classList.add('active');
            document.getElementById('toggleDetailsBtn').textContent = '🛠️ Voltar ao Modo Produtor';
        }
    }
}

// Adicionar objetivo para aluno
async function addObjective() {
    const objectiveInput = document.getElementById('objectiveText');
    const studentSelect = document.getElementById('studentObjectiveSelect');
    const objective = objectiveInput.value.trim();
    const studentName = studentSelect.value;

    if (!objective || !studentName) {
        showSaveStatus('error', '❌ Selecione aluno e digite objetivo!');
        return;
    }

    // Verificar se já tem objetivo e pedir confirmação
    const students = await loadStudents();
    const existingStudent = students.find(s => s.name === studentName);
    if (existingStudent?.objective?.trim()) {
        const confirmed = confirm(`Substituir objetivo do aluno ${studentName}?\n\nAtual: "${existingStudent.objective}"\nNovo: "${objective}"`);
        if (!confirmed) return;
    }

    // ATUALIZAÇÃO VISUAL INSTANTÂNEA
    addObjectiveVisually(studentName, objective);
    
    objectiveInput.value = '';
    studentSelect.value = '';
    
    showSaveStatus('saving', '💾 Salvando...');

    // Salvar em background
    const student = students.find(s => s.name === studentName);
    if (student) {
        student.objective = objective;
        await saveStudents(students);
        await updateStudentList(); // Sincronizar
        await updateDetails();
    }

    showSaveStatus('success', '✅ Objetivo salvo!');
}


// Atualizar select de alunos para objetivos
async function updateStudentObjectiveSelect() {
    const select = document.getElementById('studentObjectiveSelect');
    const globalStudents = await loadGlobalStudents();
    
    // Limpar opções existentes (exceto a primeira)
    select.innerHTML = '<option value="">Selecione o aluno</option>';
    
    // Ordenar alunos alfabeticamente
    globalStudents.sort((a, b) => a.localeCompare(b));
    
    // Adicionar todos os alunos globais
    globalStudents.forEach(name => {
        const option = new Option(name, name);
        select.add(option);
    });
}

// Atualizar aluno com exclusão mútua entre videocall e sentToGroup
async function updateStudentWithExclusion(studentName, field, value) {
    const students = await loadStudents();
    const student = students.find(s => s.name === studentName);
    if (student) {
        if (field === 'videocall' && value) {
            student.videocall = true;
            student.sentToGroup = false;
        } else if (field === 'sentToGroup' && value) {
            student.sentToGroup = true;
            student.videocall = false;
        } else {
            student[field] = value;
        }
        await saveStudents(students);
        
    } else {
        console.error(`Aluno ${studentName} não encontrado`);
        showSaveStatus('error', `❌ Aluno ${studentName} não encontrado`);
    }
}

// Editar nome do aluno
async function editStudentName(oldName) {
    const newName = prompt("Editar nome:", oldName)?.trim();
    if (!newName || newName === oldName) return;

    // Verificar duplicata
    const globalStudents = await loadGlobalStudents();
    if (globalStudents.some(name => name.toLowerCase() === newName.toLowerCase() && name !== oldName)) {
        showSaveStatus('error', '❌ Nome já existe!');
        return;
    }

    // ATUALIZAÇÃO VISUAL INSTANTÂNEA
    updateStudentNameVisually(oldName, newName);
    
    showSaveStatus('saving', '💾 Salvando...');
    
    // Salvar em background
    const updatedGlobalStudents = globalStudents.map(name => name === oldName ? newName : name);
    await saveGlobalStudents(updatedGlobalStudents);
    
    const months = await loadMonths();
    for (const month of months) {
        for (let week = 1; week <= 4; week++) {
            const fileName = `${month.id}-week${week}.json`;
            const weekData = await loadJsonFile(fileName, {});
            if (weekData[oldName]) {
                weekData[newName] = { ...weekData[oldName], name: newName };
                delete weekData[oldName];
                await saveJsonFile(fileName, weekData);
            }
        }
    }
    
    await updateStudentList(); // Sincronizar
    await updateChart();
    await updateDetails();
    showSaveStatus('success', '✅ Nome alterado!');
}

// Apagar aluno
async function deleteStudent(studentName) {
    if (!confirm(`Apagar "${studentName}"? TODOS OS DADOS serão perdidos!`)) return;
    
    // REMOÇÃO VISUAL INSTANTÂNEA
    removeStudentVisually(studentName);
    
    showSaveStatus('saving', '💾 Removendo...');
    
    // Salvar em background
    const globalStudents = await loadGlobalStudents();
    const updatedGlobalStudents = globalStudents.filter(name => name !== studentName);
    await saveGlobalStudents(updatedGlobalStudents);
    
    const months = await loadMonths();
    for (const month of months) {
        for (let week = 1; week <= 4; week++) {
            const fileName = `${month.id}-week${week}.json`;
            const weekData = await loadJsonFile(fileName, {});
            if (weekData[studentName]) {
                delete weekData[studentName];
                await saveJsonFile(fileName, weekData);
            }
        }
    }
    
    await updateStudentList(); // Sincronizar
    await updateChart();
    await updateDetails();
    showSaveStatus('success', '✅ Aluno removido!');
}

// Editar objetivo do aluno
async function editObjective(studentName) {
    const students = await loadStudents();
    const student = students.find(s => s.name === studentName);
    
    if (student) {
        const currentObjective = student.objective || '';
        const newObjective = prompt("Editar objetivo do aluno:", currentObjective)?.trim();
        if (newObjective === undefined || newObjective === currentObjective) return;

        // ATUALIZAÇÃO VISUAL INSTANTÂNEA
        updateObjectiveVisually(studentName, newObjective);
        
        showSaveStatus('saving', '💾 Salvando...');

        // Salvar em background
        student.objective = newObjective;
        await saveStudents(students);
        await updateStudentList(); // Sincronizar
        await updateDetails();

        showSaveStatus('success', '✅ Salvo!');
    }
}





async function initializeFileSystem() {
    console.log('Iniciando File System Access API...');
    
    // Verificar se foi chamado por interação do usuário
    if (!navigator.userActivation?.isActive) {
        console.log('Aguardando interação do usuário...');
    }

    try {
        if ('showDirectoryPicker' in window) {
            directoryHandle = await window.showDirectoryPicker({ 
                mode: 'readwrite',
                startIn: 'documents'
            });
            console.log('Diretório selecionado:', directoryHandle.name);
            return true;
        } else {
            showSaveStatus('error', '❌ Navegador não suporta File System API.');
            return false;
        }
    } catch (err) {
        if (err.name === 'AbortError') {
            alert('Seleção de diretório cancelada.');
        } else {
            alert(`Erro: ${err.message}`);
        }
        return false;
    }
}

// Sistema de fallback usando memória quando File System não está disponível

let fileCache = {};
let processedDataCache = {};

function invalidateFileCache(fileName) {
    delete fileCache[fileName];
    delete processedDataCache[fileName];
}

function debounce(func, wait = 20) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}


// Função para garantir que as pastas existem
async function ensureDirectoryStructure() {
    if (!directoryHandle) return;
    
    try {
        // Criar pasta 'meses' se não existir
        await directoryHandle.getDirectoryHandle('meses', { create: true });
        
        // Criar pasta 'config' se não existir  
        await directoryHandle.getDirectoryHandle('config', { create: true });
        
        console.log('✅ Estrutura de pastas verificada');
    } catch (err) {
        console.error('❌ Erro ao criar estrutura:', err);
    }
}

// Função para obter o caminho correto do arquivo
function getFilePath(fileName) {
    // Arquivos de configuração vão para pasta 'config'
    if (['months.json', 'globalStudents.json', 'viewState.json', 'ultima_execucao.json'].includes(fileName)) {
        return { folder: 'config', fileName: fileName };
    }
    
    // Arquivos de semanas vão para pasta do mês
    if (fileName.includes('-week')) {
        const monthId = fileName.split('-week')[0];
        const weekFileName = fileName.split('-')[2]; // week1.json, week2.json, etc.
        return { folder: `meses/${monthId}`, fileName: weekFileName };
    }
    
    // Outros arquivos ficam na raiz
    return { folder: null, fileName: fileName };
}

async function saveJsonFile(fileName, data) {
    try {
       
        if (!directoryHandle) {
            showSaveStatus('error', '❌ Configure o sistema de arquivos primeiro!');
            return false;
        }
        
        const filePath = getFilePath(fileName);
        let targetHandle = directoryHandle;
        
        if (filePath.folder) {
            const folderParts = filePath.folder.split('/');
            for (const part of folderParts) {
                targetHandle = await targetHandle.getDirectoryHandle(part, { create: true });
            }
        }
        
        const fileHandle = await targetHandle.getFileHandle(filePath.fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(data, null, 2));
        await writable.close();
        invalidateFileCache(fileName);
        
        // Atualizar timestamp APENAS se não for o próprio arquivo de modificação
        if (fileName !== 'local_modification.json' && fileName !== 'ultima_execucao.json') {
            
            await updateLocalModificationTime();
        }
        return true;
    } catch (err) {
        
        let message = '❌ Erro ao salvar';
        if (err.name === 'NotAllowedError') {
            message = '❌ Permissão negada para salvar';
        } else if (err.name === 'TypeError') {
            message = '❌ Formato de dados inválido';
        }
        showSaveStatus('error', message);
        return false;
    }
}

async function loadJsonFile(fileName, defaultValue = {}, forceReload = false) {
    if (fileCache[fileName] && !forceReload) {
        return JSON.parse(JSON.stringify(fileCache[fileName]));
    }
    
    // Arquivos que ficam na raiz (ultima_execucao) e na config (local_modification)
    if (fileName === 'ultima_execucao.json') {
        try {
            if (!directoryHandle) return defaultValue;
            const fileHandle = await directoryHandle.getFileHandle(fileName, { create: false });
            const file = await fileHandle.getFile();
            const text = await file.text();
            const data = JSON.parse(text);
            fileCache[fileName] = data;
            return data;
        } catch (err) {
            return defaultValue;
        }
    }
    
    // Arquivo local_modification.json fica na pasta config
    if (fileName === 'local_modification.json') {
        try {
            if (!directoryHandle) return defaultValue;
            const configHandle = await directoryHandle.getDirectoryHandle('config', { create: false });
            const fileHandle = await configHandle.getFileHandle(fileName, { create: false });
            const file = await fileHandle.getFile();
            const text = await file.text();
            const data = JSON.parse(text);
            fileCache[fileName] = data;
            
            return data;
        } catch (err) {
            console.log(`ℹ️ ${fileName} não encontrado na pasta config`);
            return defaultValue;
        }
    }
    try {
        if (!directoryHandle) {
            
            return defaultValue;
        }
        
        const filePath = getFilePath(fileName);
        let targetHandle = directoryHandle;
        
        if (filePath.folder) {
            const folderParts = filePath.folder.split('/');
            for (const part of folderParts) {
                try {
                    targetHandle = await targetHandle.getDirectoryHandle(part, { create: false });
                } catch (err) {
                    if (err.name === 'NotFoundError') {
                        
                        return defaultValue;
                    }
                    throw err;
                }
            }
        }
        
        const fileHandle = await targetHandle.getFileHandle(filePath.fileName, { create: false });
        const file = await fileHandle.getFile();
        const text = await file.text();
        const data = JSON.parse(text);
        
        fileCache[fileName] = data;
        return data;
    } catch (err) {
        if (err.name === 'NotFoundError') {
            
            return defaultValue;
        }
        return defaultValue;
    }
}





function showSaveStatus(type, message) {
    let statusDiv = document.getElementById('saveStatus');
    if (!statusDiv) {
        statusDiv = document.createElement('div');
        statusDiv.id = 'saveStatus';
        document.body.appendChild(statusDiv);
    }
    
    statusDiv.className = `save-status-${type} visible`;
    statusDiv.textContent = message;
    
    // Adicionar animação de pulso para 'saving'
    if (type === 'saving') {
        statusDiv.style.animation = 'pulse 1.5s infinite';
        return;
    }
    
    // Parar animação e esconder após delay
    statusDiv.style.animation = '';
    setTimeout(() => {
        statusDiv.classList.remove('visible');
    }, type === 'error' ? 3000 : 2000);
}



// SUBSTITUA a função setupFileSystem por esta versão corrigida:

async function setupFileSystem(event) {
    event?.preventDefault();
    if (directoryHandle) {
        showSaveStatus('success', '✅ Sistema já configurado!');
        updateFileSystemStatusFixed();
        return;
    }
    if (!('showDirectoryPicker' in window)) {
        showSaveStatus('error', '❌ Navegador não suporta File System API.');
        return;
    }
    if (!window.isSecureContext) {
        showSaveStatus('error', '❌ Use HTTPS ou localhost.');
        return;
    }
    try {
        const newHandle = await window.showDirectoryPicker({
            mode: 'readwrite',
            startIn: 'documents'
        });
        directoryHandle = newHandle; // Atribuir imediatamente para evitar duplicação
        await saveDirectoryHandle(newHandle);
        await ensureDirectoryStructure();
        await initData();
        await updateMonthSelect();
        await loadViewState();
        await updateChart();
        await updateDetails();
        if (!window.location.pathname.includes('aluno.html')) {
            await updateStudentList();
        }
        const mainContent = document.querySelector('main') || document.body;
        const setupBtn = document.getElementById('setupFileSystemBtn');
        setupBtn.style.display = 'none';
        mainContent.style.display = 'block';
        showSaveStatus('success', `✅ Configurado! Salvando em: ${newHandle.name}`);
        updateFileSystemStatusFixed();
    } catch (err) {
        console.error('Erro:', err);
        showSaveStatus('error', err.name === 'AbortError' ? '⚠️ Seleção cancelada.' : `❌ Erro: ${err.message}`);
    }
}


// PROBLEMA 3: Função para atualizar status do sistema de arquivos
function updateFileSystemStatusFixed() {
    const setupBtn = document.getElementById('setupFileSystemBtn');
    const statusDiv = document.getElementById('saveStatus');
    const mainContent = document.querySelector('main') || document.body;

    if (directoryHandle) {
        setupBtn.style.display = 'none';
        mainContent.style.display = 'block';
        if (statusDiv) {
            statusDiv.className = 'save-status-success';
            statusDiv.textContent = `💾 Salvando em: ${directoryHandle.name}`;
            statusDiv.style.display = 'block';
        }
    } else {
        setupBtn.style.display = 'block';
        setupBtn.textContent = '📁 Configurar';
        setupBtn.style.background = 'linear-gradient(45deg, #f59e0b, #d97706)';
        mainContent.style.display = 'none';
        if (statusDiv) {
            statusDiv.className = 'save-status-warning';
            statusDiv.textContent = '⚠️ Configure o sistema de arquivos para começar';
            statusDiv.style.display = 'block';
        }
    }
}

// Event listeners para gerenciamento de pastas
document.getElementById('listFilesBtn').addEventListener('click', listDirectoryContents);
document.getElementById('clearMonthBtn').addEventListener('click', clearMonthData);
document.getElementById('clearAllBtn').addEventListener('click', clearAllData);

function toggleSensitiveSettings() {
    const panel = document.getElementById('sensitiveSettingsPanel');
    const toggleBtn = document.getElementById('sensitiveSettingsToggle');
    if (!panel || !toggleBtn) return;
    if (panel.style.display === 'none' || panel.classList.contains('active') === false) {
        panel.style.display = 'flex';
        panel.classList.add('active');
        toggleBtn.classList.add('active');
        toggleBtn.textContent = '⚠️ Fechar Configurações';
    } else {
        panel.style.display = 'none';
        panel.classList.remove('active');
        toggleBtn.classList.remove('active');
        toggleBtn.textContent = '⚠️ Configurações Sensíveis';
    }
}

document.getElementById('sensitiveSettingsToggle').addEventListener('click', toggleSensitiveSettings);

function toggleDetailsView() {
    const producerPanel = document.getElementById('producerPanel');
    const detailsPanel = document.getElementById('detailsGrid').parentElement;
    const toggleBtn = document.getElementById('toggleDetailsBtn');
    
    if (producerPanel.classList.contains('active')) {
        producerPanel.classList.remove('active');
        detailsPanel.classList.add('active');
        toggleBtn.textContent = '🛠️ Voltar ao Modo Produtor';
    } else {
        producerPanel.classList.add('active');
        detailsPanel.classList.remove('active');
        toggleBtn.textContent = '📊 Ver Detalhes Alunos';
    }
    
    saveViewState();
}

document.getElementById('toggleDetailsBtn').addEventListener('click', toggleDetailsView);
// Filtro de alunos
// Dropdown de filtro
const filterDropdown = document.getElementById('filterDropdown');
const filterMenu = document.getElementById('filterMenu');

filterDropdown.addEventListener('click', (e) => {
    e.stopPropagation();
    filterMenu.style.display = filterMenu.style.display === 'none' ? 'block' : 'none';
});

document.querySelectorAll('#filterMenu .dropdown-item').forEach(item => {
    item.addEventListener('click', () => {
        setFilter(item.dataset.filter);
        filterMenu.style.display = 'none';
    });
});

document.addEventListener('click', () => {
    filterMenu.style.display = 'none';
});
// Event listener para pesquisa em tempo real
document.getElementById('searchStudents').addEventListener('input', handleSearch);
document.getElementById('clearSearch').addEventListener('click', clearSearch);

function setFilter(type) {
    currentFilter = type;
    
    // Atualizar texto do botão dropdown
    const filterBtn = document.getElementById('filterDropdown');
    if (type === "active") filterBtn.textContent = "🔽 Alunos Ativos";
    if (type === "all") filterBtn.textContent = "🔽 Todos os Alunos";
    if (type === "inactive") filterBtn.textContent = "🔽 Alunos Inativos";

    updateStudentList();
}

function normalizeText(text) {
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function handleSearch(event) {
    searchTerm = normalizeText(event.target.value.trim());
    updateStudentList();
}

function clearSearch() {
    document.getElementById('searchStudents').value = '';
    searchTerm = "";
    updateStudentList();
    document.getElementById('searchStudents').focus();
}
// Menu hamburger
const menuBtn = document.getElementById('menuBtn');
const menuDropdown = document.getElementById('menuDropdown');

menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menuDropdown.style.display = menuDropdown.style.display === 'none' ? 'block' : 'none';
});

document.addEventListener('click', () => {
    menuDropdown.style.display = 'none';
});

// Função para atualizar resumo semanal
async function updateWeeklySummary() {
    const week = document.getElementById('weekSelect').value;

    if (week === 'general') {
        // Esconder barra no modo geral
        document.getElementById('weeklySummary').style.display = 'none';
        return;
    } else {
        document.getElementById('weeklySummary').style.display = 'flex';
    }

    const students = await loadStudents();

    // Verificar se é janeiro de 2026 ou posterior
    const monthSelect = document.getElementById('monthSelect');
    const selectedMonth = monthSelect ? monthSelect.value : '';
    const isNewSystem = selectedMonth && selectedMonth >= '2026-01';

    const active = students.filter(s => s.active).length;
    const videocall = students.filter(s => s.active && s.videocall).length;
    const group = students.filter(s => s.active && s.sentToGroup).length;

    if (isNewSystem) {
        // Sistema novo: mostrar AS (Apresentação Semanal)
        const apresentacaoSemanal = students.filter(s => s.active && s.apresentacaoSemanal).length;

        document.getElementById('summaryActive').textContent = `A: ${active}`;
        document.getElementById('summaryVideocall').textContent = `V: ${videocall}`;
        document.getElementById('summaryGroup').textContent = `MG: ${group}`;
        document.getElementById('summaryTuesday').textContent = `AS: ${apresentacaoSemanal}`;
        // Esconder o contador de quinta-feira no sistema novo
        document.getElementById('summaryThursday').style.display = 'none';
    } else {
        // Sistema antigo: mostrar T e Q
        const tuesday = students.filter(s => s.active && s.tuesday).length;
        const thursday = students.filter(s => s.active && s.thursday).length;

        document.getElementById('summaryActive').textContent = `A: ${active}`;
        document.getElementById('summaryVideocall').textContent = `V: ${videocall}`;
        document.getElementById('summaryGroup').textContent = `MG: ${group}`;
        document.getElementById('summaryTuesday').textContent = `T: ${tuesday}`;
        document.getElementById('summaryThursday').textContent = `Q: ${thursday}`;
        // Garantir que o contador de quinta-feira esteja visível no sistema antigo
        document.getElementById('summaryThursday').style.display = 'flex';
    }
}

// Função para atualização instantânea da UI
function updateUIInstantly(studentName, field, value) {
    // Atualizar exclusão mútua instantaneamente
    if (field === 'videocall' && value) {
        const sentToGroupCheckbox = document.querySelector(`input[data-student="${studentName}"][data-field="sentToGroup"]`);
        if (sentToGroupCheckbox) {
            sentToGroupCheckbox.checked = false;
            sentToGroupCheckbox.style.transform = 'scale(0.9)';
            setTimeout(() => sentToGroupCheckbox.style.transform = 'scale(1)', 100);
        }
    } else if (field === 'sentToGroup' && value) {
        const videocallCheckbox = document.querySelector(`input[data-student="${studentName}"][data-field="videocall"]`);
        if (videocallCheckbox) {
            videocallCheckbox.checked = false;
            videocallCheckbox.style.transform = 'scale(0.9)';
            setTimeout(() => videocallCheckbox.style.transform = 'scale(1)', 100);
        }
    }
    
    // Atualizar filtros instantaneamente se 'active' mudou
    if (field === 'active') {
        updateStudentListVisually();
    }
    
    // Atualizar gráfico instantaneamente
    const week = document.getElementById('weekSelect').value;
    if (week !== 'general') {
        updateChartInstantly(studentName, field, value);
    }
    
    // Atualizar pontuação instantaneamente
    updateScoreInstantly(studentName);
    
    // Atualizar resumo semanal instantaneamente
    updateSummaryInstantly();
    
    // Atualizar detalhes instantaneamente
    updateDetailsVisually();
}

// Atualizar pontuação instantaneamente na UI
function updateScoreInstantly(studentName) {
    const studentItems = document.querySelectorAll('.student-item');
    studentItems.forEach(item => {
        if (item.dataset.studentName === studentName) {
            const checkboxes = item.querySelectorAll('input[type="checkbox"]');
            const student = { active: false, videocall: false, sentToGroup: false, tuesday: false, thursday: false, objective: '' };
            
            checkboxes.forEach(checkbox => {
                student[checkbox.dataset.field] = checkbox.checked;
            });
            
            const objectiveDiv = item.querySelector('.objective-div');
            if (objectiveDiv) {
                student.objective = objectiveDiv.textContent.replace('🎯 Objetivo: ', '');
            }
            
            const score = calculateScore(student);
            const scoreElement = item.querySelector('.student-score');
            if (scoreElement) {
                scoreElement.textContent = `${score}%`;
            }
        }
    });
}

// Atualizar resumo semanal instantaneamente
function updateSummaryInstantly() {
    const week = document.getElementById('weekSelect').value;
    if (week === 'general') return;
    
    let active = 0, videocall = 0, group = 0, tuesday = 0, thursday = 0;
    
    document.querySelectorAll('.student-item').forEach(item => {
        const checkboxes = item.querySelectorAll('input[type="checkbox"]');
        const student = {};
        checkboxes.forEach(cb => student[cb.dataset.field] = cb.checked);
        
        if (student.active) {
            active++;
            if (student.videocall) videocall++;
            if (student.sentToGroup) group++;
            if (student.tuesday) tuesday++;
            if (student.thursday) thursday++;
        }
    });
    
    document.getElementById('summaryActive').textContent = `A: ${active}`;
    document.getElementById('summaryVideocall').textContent = `V: ${videocall}`;
    document.getElementById('summaryGroup').textContent = `MG: ${group}`;
    document.getElementById('summaryTuesday').textContent = `T: ${tuesday}`;
    document.getElementById('summaryThursday').textContent = `Q: ${thursday}`;
}

// Nova função para atualizar lista visualmente (filtros)
function updateStudentListVisually() {
    const studentItems = document.querySelectorAll('.student-item');
    
    studentItems.forEach(item => {
        const activeCheckbox = item.querySelector('input[data-field="active"]');
        if (!activeCheckbox) return;
        
        const isActive = activeCheckbox.checked;
        const studentName = item.dataset.studentName?.toLowerCase() || '';
        
        let shouldShow = true;
        
        // Aplicar filtros
        if (currentFilter === "active" && !isActive) {
            shouldShow = false;
        } else if (currentFilter === "inactive" && isActive) {
            shouldShow = false;
        }
        
        // Aplicar pesquisa
        if (searchTerm && !studentName.includes(searchTerm)) {
            shouldShow = false;
        }
        
        // Animação suave
        if (shouldShow) {
            item.style.display = 'block';
            item.style.opacity = '1';
        } else {
            item.style.opacity = '0.3';
            setTimeout(() => {
                if (item.style.opacity === '0.3') {
                    item.style.display = 'none';
                }
            }, 300);
        }
    });
}

// Nova função para atualizar detalhes visualmente
function updateDetailsVisually() {
    const week = document.getElementById('weekSelect').value;
    if (week === 'general') return;
    
    // Atualizar apenas elementos visíveis sem recarregar dados
    const detailItems = document.querySelectorAll('.detail-item');
    detailItems.forEach(detailItem => {
        const nameElement = detailItem.querySelector('.detail-name');
        if (!nameElement) return;
        
        const studentName = nameElement.textContent.split(' - ')[0];
        const studentItem = document.querySelector(`[data-student-name="${studentName}"]`);
        
        if (studentItem) {
            const activeCheckbox = studentItem.querySelector('input[data-field="active"]');
            if (!activeCheckbox?.checked) {
                detailItem.style.opacity = '0.5';
                setTimeout(() => detailItem.style.display = 'none', 300);
            } else {
                detailItem.style.opacity = '1';
                detailItem.style.display = 'block';
            }
        }
    });
}

// Nova função para adicionar aluno visualmente à lista
function addStudentToListInstantly(name) {
    const studentList = document.getElementById('studentList');
    const studentItem = document.createElement('div');
    const students = [...document.querySelectorAll('.student-item')];
    const index = students.length;
    
    studentItem.className = 'student-item';
    studentItem.dataset.studentName = name;
    
    studentItem.innerHTML = `
        <div class="student-header">
            <div style="display: flex; align-items: center; gap: 15px; flex-wrap: wrap;">
                <span class="student-name">${name}</span>
                <div class="checkboxes" style="display: flex; gap: 10px; flex-wrap: wrap;">
                    <div class="checkbox-item">
                        <input type="checkbox" id="active-${index}" data-field="active" data-student="${name}" checked>
                        <label for="active-${index}">Ativo</label>
                    </div>
                    <div class="checkbox-item">
                        <input type="checkbox" id="videocall-${index}" data-field="videocall" data-student="${name}">
                        <label for="videocall-${index}">Videochamada</label>
                    </div>
                    <div class="checkbox-item">
                        <input type="checkbox" id="sentToGroup-${index}" data-field="sentToGroup" data-student="${name}">
                        <label for="sentToGroup-${index}">Mandou no grupo</label>
                    </div>
                    <div class="checkbox-item">
                        <input type="checkbox" id="tuesday-${index}" data-field="tuesday" data-student="${name}">
                        <label for="tuesday-${index}">Terça</label>
                    </div>
                    <div class="checkbox-item">
                        <input type="checkbox" id="thursday-${index}" data-field="thursday" data-student="${name}">
                        <label for="thursday-${index}">Quinta</label>
                    </div>
                </div>
            </div>
            <div class="student-actions">
                <button class="icon-btn objective-btn" title="Adicionar objetivo" style="width: 25px; height: 25px; font-size: 10px;">🎯</button>
                <button class="icon-btn edit-btn" title="Editar nome" style="width: 25px; height: 25px; font-size: 10px;">✏️</button>
                <button class="icon-btn delete-btn" title="Apagar aluno" style="width: 25px; height: 25px; font-size: 10px; background: linear-gradient(45deg, #ef4444, #dc2626);">🗑️</button>
                <span class="student-score">0%</span>
            </div>
        </div>
    `;
    
    // Inserir ordenado alfabeticamente
    const allItems = [...studentList.querySelectorAll('.student-item')];
    const insertIndex = allItems.findIndex(item => 
        item.dataset.studentName?.localeCompare(name) > 0
    );
    
    if (insertIndex === -1) {
        studentList.appendChild(studentItem);
    } else {
        studentList.insertBefore(studentItem, allItems[insertIndex]);
    }
    
    // Animação de entrada
    studentItem.style.opacity = '0';
    studentItem.style.transform = 'scale(0.95)';
    setTimeout(() => {
        studentItem.style.opacity = '1';
        studentItem.style.transform = 'scale(1)';
    }, 100);
    
    // Atualizar select de objetivos
    updateStudentObjectiveSelectInstantly(name);
}

// Nova função para atualizar select de objetivos instantaneamente
function updateStudentObjectiveSelectInstantly(newStudentName = null) {
    const select = document.getElementById('studentObjectiveSelect');
    
    if (newStudentName) {
        const option = new Option(newStudentName, newStudentName);
        
        // Inserir ordenado
        const options = [...select.options].slice(1); // Remove primeira opção
        const insertIndex = options.findIndex(opt => opt.text.localeCompare(newStudentName) > 0);
        
        if (insertIndex === -1) {
            select.add(option);
        } else {
            select.add(option, insertIndex + 1);
        }
    }
}

// Nova função para atualizar nome visualmente
function updateStudentNameVisually(oldName, newName) {
    // Atualizar na lista de alunos
    const studentItem = document.querySelector(`[data-student-name="${oldName}"]`);
    if (studentItem) {
        studentItem.dataset.studentName = newName;
        const nameElement = studentItem.querySelector('.student-name');
        if (nameElement) {
            nameElement.textContent = newName;
            // Efeito visual
            nameElement.style.color = '#10b981';
            setTimeout(() => nameElement.style.color = '', 1000);
        }
        
        // Atualizar data-student dos checkboxes
        const checkboxes = studentItem.querySelectorAll('input[data-student]');
        checkboxes.forEach(cb => cb.dataset.student = newName);
    }
    
    // Atualizar no gráfico
    const bars = document.querySelectorAll('.bar');
    bars.forEach(bar => {
        const barName = bar.querySelector('.bar-name');
        if (barName && barName.textContent === oldName) {
            barName.textContent = newName;
        }
    });
    
    // Atualizar no select de objetivos
    const select = document.getElementById('studentObjectiveSelect');
    const options = [...select.options];
    const option = options.find(opt => opt.text === oldName);
    if (option) {
        option.text = newName;
        option.value = newName;
    }
    
    // Atualizar nos detalhes
    const detailItems = document.querySelectorAll('.detail-item');
    detailItems.forEach(item => {
        const nameElement = item.querySelector('.detail-name');
        if (nameElement && nameElement.textContent.includes(oldName)) {
            nameElement.textContent = nameElement.textContent.replace(oldName, newName);
        }
    });
}

// Nova função para remover aluno visualmente
function removeStudentVisually(studentName) {
    // Remover da lista com animação
    const studentItem = document.querySelector(`[data-student-name="${studentName}"]`);
    if (studentItem) {
        studentItem.style.opacity = '0';
        studentItem.style.transform = 'scale(0.95)';
        setTimeout(() => studentItem.remove(), 300);
    }
    
    // Remover do gráfico
    const bars = document.querySelectorAll('.bar');
    bars.forEach(bar => {
        const barName = bar.querySelector('.bar-name');
        if (barName && barName.textContent === studentName) {
            bar.style.opacity = '0';
            setTimeout(() => bar.remove(), 300);
        }
    });
    
    // Remover do select de objetivos
    const select = document.getElementById('studentObjectiveSelect');
    const options = [...select.options];
    const option = options.find(opt => opt.text === studentName);
    if (option) {
        option.remove();
    }
    
    // Remover dos detalhes
    const detailItems = document.querySelectorAll('.detail-item');
    detailItems.forEach(item => {
        const nameElement = item.querySelector('.detail-name');
        if (nameElement && nameElement.textContent.includes(studentName)) {
            item.style.opacity = '0';
            setTimeout(() => item.remove(), 300);
        }
    });
    
    // Atualizar resumo instantaneamente
    updateSummaryInstantly();
}

// Nova função para adicionar objetivo visualmente
function addObjectiveVisually(studentName, objective) {
    const studentItem = document.querySelector(`[data-student-name="${studentName}"]`);
    if (!studentItem) return;
    
    // Remover botão "adicionar objetivo" se existir
    const objectiveBtn = studentItem.querySelector('.objective-btn');
    if (objectiveBtn) {
        objectiveBtn.remove();
    }
    
    // Adicionar div do objetivo
    const existingObjective = studentItem.querySelector('.objective-div');
    if (existingObjective) {
        existingObjective.remove();
    }
    
    const objectiveDiv = document.createElement('div');
    objectiveDiv.className = 'objective-div';
    objectiveDiv.style.cssText = 'background: rgba(74, 172, 254, 0.2); padding: 8px; border-radius: 8px; margin: 8px 0; border-left: 3px solid #4facfe; cursor: pointer; transition: background 0.2s ease;';
    objectiveDiv.title = 'Clique para editar objetivo';
    objectiveDiv.innerHTML = `<strong>🎯 Objetivo:</strong> ${objective}`;
    
    const studentHeader = studentItem.querySelector('.student-header');
    studentHeader.insertAdjacentElement('afterend', objectiveDiv);
    
    // Efeito visual
    objectiveDiv.style.opacity = '0';
    objectiveDiv.style.transform = 'scale(0.95)';
    setTimeout(() => {
        objectiveDiv.style.opacity = '1';
        objectiveDiv.style.transform = 'scale(1)';
    }, 100);
    
    // Atualizar pontuação instantaneamente
    updateScoreInstantly(studentName);
}

// Nova função para atualizar objetivo visualmente
function updateObjectiveVisually(studentName, newObjective) {
    const studentItem = document.querySelector(`[data-student-name="${studentName}"]`);
    if (!studentItem) return;
    
    const existingObjective = studentItem.querySelector('.objective-div');
    
    if (!newObjective) {
        // Remover objetivo
        if (existingObjective) {
            existingObjective.style.opacity = '0';
            setTimeout(() => existingObjective.remove(), 300);
        }
        
        // Adicionar botão "adicionar objetivo"
        const actions = studentItem.querySelector('.student-actions');
        if (actions && !actions.querySelector('.objective-btn')) {
            const objectiveBtn = document.createElement('button');
            objectiveBtn.className = 'icon-btn objective-btn';
            objectiveBtn.title = 'Adicionar objetivo';
            objectiveBtn.style.cssText = 'width: 25px; height: 25px; font-size: 10px;';
            objectiveBtn.textContent = '🎯';
            
            const editBtn = actions.querySelector('.edit-btn');
            actions.insertBefore(objectiveBtn, editBtn);
        }
    } else {
        // Atualizar objetivo existente ou criar novo
        if (existingObjective) {
            existingObjective.innerHTML = `<strong>🎯 Objetivo:</strong> ${newObjective}`;
            // Efeito visual
            existingObjective.style.backgroundColor = 'rgba(16, 185, 129, 0.2)';
            setTimeout(() => existingObjective.style.backgroundColor = 'rgba(74, 172, 254, 0.2)', 1000);
        } else {
            addObjectiveVisually(studentName, newObjective);
        }
    }
    
    // Atualizar pontuação instantaneamente
    updateScoreInstantly(studentName);
}

// Atualizar gráfico instantaneamente
function updateChartInstantly(studentName, field, value) {
    const chart = document.getElementById('chart');
    const bars = chart.querySelectorAll('.bar');
    
    bars.forEach(bar => {
        const barName = bar.querySelector('.bar-name');
        if (barName && barName.textContent === studentName) {
            const barFill = bar.querySelector('.bar-fill');
            if (barFill) {
                // Calcular novo score baseado nos checkboxes atuais
                const studentItem = document.querySelector(`[data-student-name="${studentName}"]`);
                if (studentItem) {
                    const checkboxes = studentItem.querySelectorAll('input[type="checkbox"]');
                    const student = { objective: '' };
                    checkboxes.forEach(cb => student[cb.dataset.field] = cb.checked);
                    
                    const objectiveDiv = studentItem.querySelector('.objective-div');
                    if (objectiveDiv) student.objective = 'tem objetivo';
                    
                    const newScore = calculateScore(student);
                    
                    // Atualizar visualmente
                    barFill.style.height = `${Math.max(newScore * 2.5, 20)}px`;
                    barFill.textContent = `${newScore}%`;
                    
                    // Atualizar classes de cor
                    barFill.classList.remove('high', 'medium', 'low');
                    if (newScore >= 80) {
                        barFill.classList.add('high');
                    } else if (newScore >= 50) {
                        barFill.classList.add('medium');
                    } else {
                        barFill.classList.add('low');
                    }
                    
                    // Adicionar/remover estrela
                    const existingStar = bar.querySelector('.star');
                    if (newScore === 100 && !existingStar) {
                        const star = document.createElement('div');
                        star.className = 'star';
                        star.textContent = '⭐';
                        bar.appendChild(star);
                    } else if (newScore !== 100 && existingStar) {
                        existingStar.remove();
                    }
                    
                    // Efeito visual de atualização
                    barFill.style.transform = 'scale(1.05)';
                    setTimeout(() => barFill.style.transform = 'scale(1)', 200);
                }
            }
        }
    });
}

// BOTÃO SUBIR - VERSÃO CORRIGIDA


async function updateLocalModificationTime() {
    if (!directoryHandle) return;
    
    try {
        const now = new Date();
        const timestamp = now.toLocaleString('pt-BR');
        const data = { 
            ultima_modificacao: timestamp,
            timestamp_unix: now.getTime()
        };
        
     
        
        // Salvar DIRETAMENTE sem chamar saveJsonFile (evita loop)
        const configHandle = await directoryHandle.getDirectoryHandle('config', { create: true });
        const fileHandle = await configHandle.getFileHandle('local_modification.json', { create: true });
        
        // CRITICAL: keepExistingData: false para GARANTIR sobrescrita
        const writable = await fileHandle.createWritable({ keepExistingData: false });
        await writable.write(JSON.stringify(data, null, 2));
        await writable.close();
        
        
        
        // Aguardar um momento para o sistema de arquivos sincronizar
        await new Promise(resolve => setTimeout(resolve, 100));
        
       
        
        // Invalidar cache para forçar leitura do novo timestamp
        invalidateFileCache('local_modification.json');
        
        // Verificar se realmente foi salvo
        const verificacao = await configHandle.getFileHandle('local_modification.json');
        const fileVerif = await verificacao.getFile();
        const textVerif = await fileVerif.text();
        
    } catch (err) {
        console.error('Erro ao atualizar timestamp:', err);
    }
}

async function getLastModificationTime() {
    try {
        invalidateFileCache('local_modification.json');
        const data = await loadJsonFile('local_modification.json', null, true);
        return data?.timestamp_unix || 0;
    } catch {
        return 0;
    }
}

async function getLastUploadTime() {
    try {
        const data = await loadJsonFile('ultima_execucao.json', null);
        if (!data?.ultima_execucao) return 0;
        
        // Parse do formato "30 Sep 25 às 12:10"
        const dateStr = data.ultima_execucao.replace(' às ', ' ');
        const date = new Date(dateStr);
        return date.getTime();
    } catch {
        return 0;
    }
}

async function updateLastUploadTime() {
    try {
        
        const uploadBtn = document.getElementById('uploadGithubBtn');
        const lastUploadElement = document.getElementById('lastUploadTime');
        
        const uploadTime = await getLastUploadTime();
        const modificationTime = await getLastModificationTime();
        
        
        const uploadData = await loadJsonFile('ultima_execucao.json', null);
        

        const modData = await loadJsonFile('local_modification.json', null);
        
        // Verificar se tem alterações pendentes
        const hasChanges = modificationTime > uploadTime;
        const timeDiff = hasChanges ? Math.floor((Date.now() - modificationTime) / 1000 / 60) : 0; // minutos
        
        // Atualizar visual do botão
        uploadBtn.classList.remove('status-synced', 'status-pending', 'status-critical');
        
        if (!uploadTime) {
            // Nunca fez upload
            uploadBtn.classList.add('status-critical');
            lastUploadElement.textContent = 'Nunca executado';
        } else if (!hasChanges) {
            // Sincronizado
            uploadBtn.classList.add('status-synced');
            lastUploadElement.textContent = `✅ Sincronizado (${uploadData.ultima_execucao})`;
        } else if (timeDiff < 30) {
            // Alterações recentes
            uploadBtn.classList.add('status-pending');
            lastUploadElement.textContent = `⚠️ Alterações há ${timeDiff} min`;
        } else {
            // Alterações antigas
            uploadBtn.classList.add('status-critical');
            lastUploadElement.textContent = `🔴 Alterações há ${timeDiff} min!`;
        }
    } catch (err) {
        document.getElementById('lastUploadTime').textContent = 'Erro ao verificar';
    }
}

document.getElementById('uploadGithubBtn').addEventListener('click', async () => {
    showSaveStatus('saving', 'Upando para GitHub...');

    try {
        const configResponse = await fetch('/config.json');
        const config = await configResponse.json();
        const serverPort = config.port || window.location.port || 8005;

        const response = await fetch(`http://localhost:${serverPort}/executar-python`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ arquivo: 'subir_arquivos_parede.py' })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();

        if (result.sucesso) {
            showSaveStatus('success', '✅ Upload concluído com sucesso!');

            // Aguardar o arquivo ser atualizado
            await new Promise(resolve => setTimeout(resolve, 500));

            // Invalidar cache e recarregar
            invalidateFileCache('ultima_execucao.json');
            const uploadData = await loadJsonFile('ultima_execucao.json', null, true);

            if (uploadData?.ultima_execucao) {
                // Sincronizar timestamps
                const uploadDate = new Date(uploadData.ultima_execucao.replace(' às ', ' '));
                const syncData = {
                    ultima_modificacao: uploadData.ultima_execucao,
                    timestamp_unix: uploadDate.getTime()
                };

                const configHandle = await directoryHandle.getDirectoryHandle('config', { create: true });
                const fileHandle = await configHandle.getFileHandle('local_modification.json', { create: true });
                const writable = await fileHandle.createWritable({ keepExistingData: false });
                await writable.write(JSON.stringify(syncData, null, 2));
                await writable.close();

                invalidateFileCache('local_modification.json');
            }

            // Atualizar visual
            await updateLastUploadTime();
        } else {
            showSaveStatus('error', '❌ Erro no upload!');
            console.error('Erro do script:', result.stderr || result.erro);
        }
    } catch (error) {
        showSaveStatus('error', '❌ Erro ao conectar ao servidor!');
        console.error('Erro completo:', error);
    }
});

// Modal functionality
const modal = document.getElementById('presentationsModal');
const openBtn = document.getElementById('openPresentationsBtn');
const closeBtn = document.querySelector('.close');

openBtn.onclick = function() {
    modal.style.display = 'block';
}

closeBtn.onclick = function() {
    modal.style.display = 'none';
}

window.onclick = function(event) {
    if (event.target == modal) {
        modal.style.display = 'none';
    }
}

document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        modal.style.display = 'none';
    }
});
