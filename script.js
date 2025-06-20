
let globalListenerAdded = false;

function addGlobalEventListener() {
    if (globalListenerAdded) return;
    
    const studentList = document.getElementById('studentList');
    
    // Event delegation - um único listener para todos os checkboxes
    const debouncedChangeHandler = debounce(async (e) => {
        if (e.target.type === 'checkbox' && e.target.dataset.student) {
            const studentName = e.target.dataset.student;
            const field = e.target.dataset.field;
            const value = e.target.checked;
            
            console.log(`Checkbox ${field} changed to ${value} for ${studentName}`);
            
            if (field === 'videocall' || field === 'sentToGroup') {
                await updateStudentWithExclusion(studentName, field, value);
            } else {
                await updateStudent(studentName, field, value);
            }
            
            // Atualizar apenas o necessário
            const week = document.getElementById('weekSelect').value;
            if (week !== 'general') {
                await updateChart();
                await updateDetails();
            }
            await updateStudentList();
        }
    }, 50);
    
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
        } else if (e.target.classList.contains('objective-btn')) {
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
        console.log(`Diretório salvo no IndexedDB: ${handle.name}`);
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
                            console.log(`Diretório restaurado: ${saved.name}`);
                            showSaveStatus('success', `✅ Conectado a: ${saved.name}`);
                            updateFileSystemStatusFixed();
                            resolve(true);
                        } else if (permission === 'prompt') {
                            const granted = await saved.handle.requestPermission({ mode: 'readwrite' });
                            if (granted === 'granted') {
                                directoryHandle = saved.handle;
                                localStorage.setItem('directoryHandleName', saved.name);
                                sessionStorage.setItem('directoryHandleName', saved.name);
                                console.log(`Permissão concedida: ${saved.name}`);
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
    console.log('Inicializando dados...');
    
    // Apenas inicializar dados padrão em memória se não existirem
    if (!memoryStorage['months.json']) {
        const defaultMonths = [
            { id: "2025-06", name: "Junho 2025", monthNumber: 6, year: 2025 },
            { id: "2025-05", name: "Maio 2025", monthNumber: 5, year: 2025 },
            { id: "2025-04", name: "Abril 2025", monthNumber: 4, year: 2025 }
        ];
        memoryStorage['months.json'] = defaultMonths;
    }
    
    if (!memoryStorage['globalStudents.json']) {
        const defaultStudents = [
            "Ana Silva", "Bruno Costa", "Carlos Mendes", "Diana Rocha", "Eduardo Lima",
            "Fernanda Alves", "Gabriel Santos", "Helena Martins", "Igor Pereira", "Julia Ferreira"
        ];
        memoryStorage['globalStudents.json'] = defaultStudents;
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
    
    const weekData = await loadJsonFileWithFallback(fileName, {});
    
    // Retornar todos os alunos globais com seus dados da semana atual
    const globalStudents = await loadGlobalStudents();
    return globalStudents.map(name => {
        const student = weekData[name] || {
            name: name,
            active: false,
            videocall: false,
            sentToGroup: false,
            tuesday: false,
            thursday: false
        };

        // Adicionar campos se não existirem
        if (!student.objective) {
            student.objective = '';
        }
        if (student.sentToGroup === undefined) {
            student.sentToGroup = false;
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
    
    // Inicializar todos os alunos globais
    globalStudents.forEach(name => {
        monthlyStats[name] = {
            name: name,
            weeks: [],
            totalScore: 0,
            weekCount: 0
        };
    });
    
    for (let week = 1; week <= 4; week++) {
        const fileName = `${monthId}-week${week}.json`;
        const weekData = await loadJsonFileWithFallback(fileName, {});
        
        globalStudents.forEach(name => {
            const studentData = weekData[name] || {
                name: name,
                active: false,
                videocall: false,
                tuesday: false,
                thursday: false
            };
            
            const score = calculateScore(studentData);
            monthlyStats[name].weeks.push({
                week: week,
                score: score,
                active: studentData.active
            });
            
            if (studentData.active) {
                monthlyStats[name].totalScore += score;
                monthlyStats[name].weekCount++;
            }
        });
    }
    
    // Calcular médias e objetivos
    Object.values(monthlyStats).forEach(student => {
        student.averageScore = student.weekCount > 0 ? 
            Math.round(student.totalScore / student.weekCount) : 0;
        
        student.objectiveCount = 0;
        
        // Contar objetivos em todas as 4 semanas
        for (let week = 1; week <= 4; week++) {
            const fileName = `${monthId}-week${week}.json`;
            // Usar loadJsonFile de forma síncrona aqui seria problemático, 
            // então vamos contar depois na interface
        }
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
    
    console.log(`Salvando dados para ${fileName}:`, weekData); // Log para depuração
    
    const success = await saveJsonFile(fileName, weekData);
    if (success) {
        console.log(`Dados salvos com sucesso para ${fileName}`);
        await updateStudentList(); // Mantém apenas a atualização da lista
    } else {
        console.error(`Falha ao salvar ${fileName}`);
    }
}
// Calcular pontuação
const calculateScore = (function() {
    const cache = new Map();
    return function(student) {
        if (!student.active) return 0;
        const key = `${student.name}-${student.videocall}-${student.sentToGroup}-${student.tuesday}-${student.thursday}`;
        if (cache.has(key)) {
            return cache.get(key);
        }
        let score = 0;
        if (student.videocall || student.sentToGroup) score += 33.33;
        if (student.tuesday) score += 33.33;
        if (student.thursday) score += 33.33;
        const result = Math.round(score);
        cache.set(key, result);
        return result;
    };
})();

// Carregar meses salvos
async function loadMonths() {
    console.log('Carregando meses...');
    const defaultMonths = [
        { id: "2025-06", name: "Junho 2025", monthNumber: 6, year: 2025 },
        { id: "2025-05", name: "Maio 2025", monthNumber: 5, year: 2025 },
        { id: "2025-04", name: "Abril 2025", monthNumber: 4, year: 2025 }
    ];
    return await loadJsonFileWithFallback('months.json', defaultMonths);
}

// Salvar meses
async function saveMonths(months) {
    console.log('Salvando meses...');
    const success = await saveJsonFile('months.json', months);
    if (success) showSaveStatus('success', '✅ Meses salvos!');
}
// Carregar lista global de alunos
async function loadGlobalStudents() {
    const defaultStudents = [
        "Ana Silva", "Bruno Costa", "Carlos Mendes", "Diana Rocha", "Eduardo Lima",
        "Fernanda Alves", "Gabriel Santos", "Helena Martins", "Igor Pereira", "Julia Ferreira"
    ];
    return await loadJsonFileWithFallback('globalStudents.json', defaultStudents);
}

// Salvar lista global de alunos
async function saveGlobalStudents(students) {
    const success = await saveJsonFile('globalStudents.json', students);
    if (success) showSaveStatus('success', '✅ Alunos globais salvos!');
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
        const monthlyData = await loadMonthlyData();
        monthlyData.sort((a, b) => b.averageScore - a.averageScore);
        
        monthlyData.forEach(student => {
            if (student.weekCount > 0) {
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
            }
        });
    } else {
        const students = (await loadStudents()).filter(s => s.active);
        students.sort((a, b) => calculateScore(b) - calculateScore(a));
        
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
    const students = await loadStudents();
    students.sort((a, b) => a.name.localeCompare(b.name));

    const studentList = document.getElementById('studentList');
    studentList.innerHTML = '';

    students.forEach((student, index) => {
        const studentItem = document.createElement('div');
        studentItem.className = 'student-item';
        studentItem.dataset.studentName = student.name; // Importante para event delegation
        const score = calculateScore(student);

        studentItem.innerHTML = `
            <div class="student-header">
                <span class="student-name">${student.name}</span>
                <div style="display: flex; gap: 5px; align-items: center;">
                    ${!student.objective ? `<button class="icon-btn objective-btn" title="Adicionar objetivo" style="width: 25px; height: 25px; font-size: 10px;">🎯</button>` : ''}
                    <button class="icon-btn edit-btn" title="Editar nome" style="width: 25px; height: 25px; font-size: 10px;">✏️</button>
                    <button class="icon-btn delete-btn" title="Apagar aluno" style="width: 25px; height: 25px; font-size: 10px; background: linear-gradient(45deg, #ef4444, #dc2626);">🗑️</button>
                    <span class="student-score">${score}%</span>
                </div>
            </div>
            ${student.objective ? `<div style="background: rgba(74, 172, 254, 0.2); padding: 8px; border-radius: 8px; margin: 8px 0; border-left: 3px solid #4facfe; display: flex; justify-content: space-between; align-items: center;"><div><strong>🎯 Objetivo:</strong> ${student.objective}</div><button class="icon-btn objective-btn" title="Editar objetivo" style="width: 20px; height: 20px; font-size: 8px;">✏️</button></div>` : ''}
            <div class="checkboxes">
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
                <div class="checkbox-item">
                    <input type="checkbox" id="tuesday-${index}" data-field="tuesday" data-student="${student.name}" ${student.tuesday ? 'checked' : ''}>
                    <label for="tuesday-${index}">Terça-feira</label>
                </div>
                <div class="checkbox-item">
                    <input type="checkbox" id="thursday-${index}" data-field="thursday" data-student="${student.name}" ${student.thursday ? 'checked' : ''}>
                    <label for="thursday-${index}">Quinta-feira</label>
                </div>
            </div>
        `;

        studentList.appendChild(studentItem);
    });
}

function countStudentItems(student) {
    let count = 0;
    if (student.videocall) count++;
    if (student.sentToGroup) count++;
    if (student.tuesday) count++;
    if (student.thursday) count++;
    if (student.objective) count++;
    return count;
}

// Atualizar detalhes dos alunos
async function updateDetails() {
    const week = document.getElementById('weekSelect').value;
    const detailsGrid = document.getElementById('detailsGrid');
    const detailsTitle = document.querySelector('.student-details h3');
    
    if (week === 'general') {
        // Modo geral - mostrar resumo mensal
        detailsTitle.textContent = '📊 Resumo Mensal';
        const monthlyData = await loadMonthlyData();
        
        if (monthlyData.length === 0 || monthlyData.every(s => s.weekCount === 0)) {
            detailsGrid.innerHTML = '<p style="text-align: center; color: #888;">Nenhum dado para este mês</p>';
            return;
        }
        
        detailsGrid.innerHTML = '';
        
        monthlyData
            .filter(student => student.weekCount > 0)
            .sort((a, b) => b.averageScore - a.averageScore)
            .forEach(student => {
                const detailItem = document.createElement('div');
                detailItem.className = 'detail-item';
                
                const weeksInfo = student.weeks
                    .filter(w => w.active)
                    .map(w => `S${w.week}: ${w.score}%`)
                    .join(' | ');
                
                detailItem.innerHTML = `
                    <div class="detail-name">${student.name} - Média: ${student.averageScore}%</div>
                    <div class="detail-activities">
                        <span class="activity-summary">
                            📈 ${student.weekCount} semana(s) ativas
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
        // Modo semana individual (código original)
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
            
            detailItem.innerHTML = `
                <div class="detail-name">${student.name} - ${score}%</div>
                ${student.objective ? `<div style="background: rgba(74, 172, 254, 0.2); padding: 8px; border-radius: 8px; margin: 8px 0; border-left: 3px solid #4facfe; font-size: 0.9em;"><strong>🎯 Objetivo:</strong> ${student.objective}</div>` : ''}
                <div class="detail-activities">
                    <span class="activity ${(student.videocall || student.sentToGroup) ? 'done' : 'not-done'}">
                        ${student.videocall ? '✅ Videochamada' : 
                        student.sentToGroup ? '✅ Mandou no grupo' : 
                        '❌ Videochamada / Mandou no grupo'}
                    </span>
                    <span class="activity ${student.tuesday ? 'done' : 'not-done'}">
                        ${student.tuesday ? '✅' : '❌'} Terça
                    </span>
                    <span class="activity ${student.thursday ? 'done' : 'not-done'}">
                        ${student.thursday ? '✅' : '❌'} Quinta
                    </span>
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
        showSaveStatus('error', `❌ Aluno ${studentName} não encontrado`);
    }
}


// Adicionar aluno
async function addStudent() {
    const nameInput = document.getElementById('newStudentName');
    const name = nameInput.value.trim();
    
    if (name) {
        const globalStudents = await loadGlobalStudents();
        if (globalStudents.some(student => 
            student.toLowerCase().trim() === name.toLowerCase().trim()
        )) {
            showSaveStatus('error', '❌ Este aluno já está cadastrado no sistema!');
            return;
        }
        
        // Adicionar à lista global
        globalStudents.push(name);
        await saveGlobalStudents(globalStudents);
        
        // Atualizar lista atual
        await updateStudentList();
        nameInput.value = '';
    }
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

// Event listeners

document.getElementById('newStudentName').addEventListener('keypress', async function(e) {
    if (e.key === 'Enter') {
        await addStudent();
    }
});
document.getElementById('objectiveText').addEventListener('keypress', async function(e) {
    if (e.key === 'Enter') {
        await addObjective();
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
    const panel = document.getElementById('sensitiveSettingsPanel');
    const toggleBtn = document.getElementById('sensitiveSettingsToggle');
    if (panel && toggleBtn) {
        panel.style.display = 'none';
        panel.classList.remove('active');
        toggleBtn.classList.remove('active');
        toggleBtn.textContent = '⚠️ Configurações Sensíveis';
    }
    
    const restored = await restoreDirectoryHandle();
    if (!restored) {
        showSaveStatus('warning', '⚠️ Dados temporários - Configurar salvamento');
    } else {
        await migrateMemoryToFilesFixed();
    }
    await initData();
    await updateMonthSelect();
    await loadViewState();
    await updateChart();
    await updateDetails();
    await updateStudentList();
    updateFileSystemStatusFixed();
});

window.addEventListener('beforeunload', (e) => {
    if (!directoryHandle && Object.keys(memoryStorage).length > 0) {
        e.preventDefault();
        e.returnValue = '⚠️ Dados não salvos no sistema de arquivos! Deseja sair sem salvar?';
        return e.returnValue;
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
    await debouncedUpdate();
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
            objective: previousStudent?.objective || ''
        };
    });
    
    await saveJsonFile(currentWeekKey + '.json', currentWeekData);
    await updateChart();
    await updateDetails();
    await updateStudentList();
    showSaveStatus('success', '✅ Dados copiados!');
}
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
    const viewState = await loadJsonFileWithFallback('viewState.json', {});
    
    if (viewState.selectedMonth) {
        const monthSelect = document.getElementById('monthSelect');
        if (monthSelect.querySelector(`option[value="${viewState.selectedMonth}"]`)) {
            monthSelect.value = viewState.selectedMonth;
        }
    }
    
    if (viewState.selectedWeek) {
        document.getElementById('weekSelect').value = viewState.selectedWeek;
    }
    
    if (viewState.detailsView) {
        const producerPanel = document.getElementById('producerPanel');
        const detailsPanel = document.getElementById('detailsGrid').parentElement;
        const toggleBtn = document.getElementById('toggleDetailsBtn');
        producerPanel.classList.remove('active');
        detailsPanel.classList.add('active');
        toggleBtn.textContent = '🛠️ Voltar ao Modo Produtor';
    }
}

// Adicionar objetivo para aluno
async function addObjective() {
    const objectiveText = document.getElementById('objectiveText').value.trim();
    const selectedStudent = document.getElementById('studentObjectiveSelect').value;
    
    if (!objectiveText) {
        showSaveStatus('error', '❌ Digite um objetivo!');
        return;
    }
    
    if (!selectedStudent) {
        showSaveStatus('error', '❌ Selecione um aluno!');
        return;
    }
    
    const students = await loadStudents();
    const student = students.find(s => s.name === selectedStudent);
    
    if (student) {
        student.objective = objectiveText;
        await saveStudents(students);
        document.getElementById('objectiveText').value = '';
        document.getElementById('studentObjectiveSelect').value = '';
        await updateStudentList();
        showSaveStatus('success', '✅ Objetivo adicionado!');
    }
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
    
    const globalStudents = await loadGlobalStudents();
    if (globalStudents.some(name => name.toLowerCase() === newName.toLowerCase() && name !== oldName)) {
        showSaveStatus('error', '❌ Nome já existe!');
        return;
    }
    
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
    
    await updateStudentList();
    await updateChart();
    await updateDetails();
    await updateStudentObjectiveSelect();
    showSaveStatus('success', '✅ Nome alterado!');
}

// Apagar aluno
async function deleteStudent(studentName) {
    if (!confirm(`Apagar "${studentName}"? TODOS OS DADOS serão perdidos!`)) return;
    
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
    
    await updateStudentList();
    await updateChart();
    await updateDetails();
    await updateStudentObjectiveSelect();
    showSaveStatus('success', '✅ Aluno removido!');
}

// Editar objetivo do aluno
async function editObjective(studentName) {
    const students = await loadStudents();
    const student = students.find(s => s.name === studentName);
    
    if (student) {
        const currentObjective = student.objective || '';
        const newObjective = prompt("Editar objetivo do aluno:", currentObjective);
        
        if (newObjective !== null) { // null = cancelou, string vazia = quer limpar
            student.objective = newObjective.trim();
            await saveStudents(students);
            await updateStudentList();
            await updateDetails();
            
            if (newObjective.trim()) {
                showSaveStatus('success', '✅ Objetivo atualizado com sucesso!');
            } else {
                showSaveStatus('success', '✅ Objetivo removido!');
            }
        }
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
let memoryStorage = {};
let fileCache = {};
let processedDataCache = {};

function invalidateFileCache(fileName) {
    delete fileCache[fileName];
    delete processedDataCache[fileName];
    console.log(`🗑️ Cache de ${fileName} invalidado`);
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
    if (['months.json', 'globalStudents.json', 'viewState.json'].includes(fileName)) {
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
        if (directoryHandle) {
            console.log(`💾 Salvando ${fileName} no File System...`);
            
           
            
            const filePath = getFilePath(fileName);
            let targetHandle = directoryHandle;
            
            // Navegar para a pasta correta se necessário
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

            
            showSaveStatus('success', `✅ ${fileName} salvo com sucesso!`);
            return true;
        } else {
            console.warn(`⚠️ Salvando ${fileName} em memória (File System não configurado)`);
            memoryStorage[fileName] = JSON.parse(JSON.stringify(data));
            invalidateFileCache(fileName);
            showSaveStatus('warning', `⚠️ ${fileName} salvo apenas em memória`);
            return true;
        }
    } catch (err) {
        console.error(`❌ Erro ao salvar ${fileName}:`, err);
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

async function loadJsonFile(fileName, defaultValue = {}) {
    if (processedDataCache[fileName]) {
        console.log(`📂 Carregando ${fileName} do cache processado...`);
        return JSON.parse(JSON.stringify(processedDataCache[fileName]));
    }
    
    if (fileCache[fileName]) {
        console.log(`📂 Carregando ${fileName} do cache bruto...`);
        return JSON.parse(JSON.stringify(fileCache[fileName]));
    }
    
    try {
        if (directoryHandle) {
            console.log(`📂 Carregando ${fileName} do File System...`);
            const filePath = getFilePath(fileName);
            let targetHandle = directoryHandle;
            
            if (filePath.folder) {
                const folderParts = filePath.folder.split('/');
                for (const part of folderParts) {
                    try {
                        targetHandle = await targetHandle.getDirectoryHandle(part, { create: false });
                    } catch (err) {
                        if (err.name === 'NotFoundError') {
                            console.log(`ℹ️ Pasta ${part} não encontrada, retornando valor padrão`);
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
            processedDataCache[fileName] = data;
            console.log(`✅ ${fileName} carregado com sucesso`);
            return data;
        } else if (memoryStorage[fileName]) {
            console.warn(`⚠️ Carregando ${fileName} da memória`);
            fileCache[fileName] = memoryStorage[fileName];
            processedDataCache[fileName] = memoryStorage[fileName];
            return JSON.parse(JSON.stringify(memoryStorage[fileName]));
        } else {
            console.log(`ℹ️ ${fileName} não encontrado, retornando valor padrão`);
            return defaultValue;
        }
    } catch (err) {
        if (err.name === 'NotFoundError') {
            console.log(`ℹ️ ${fileName} não encontrado, retornando valor padrão`);
            return defaultValue;
        }
        console.error(`❌ Erro ao carregar ${fileName}:`, err);
        showSaveStatus('error', `❌ Erro ao carregar ${fileName}`);
        return defaultValue;
    }
}

// Função para migrar arquivos da estrutura antiga para nova
async function migrateToNewStructure() {
    if (!directoryHandle) return;
    
    console.log('🔄 Verificando migração para nova estrutura...');
    
    try {
        // Listar todos os arquivos na raiz
        for await (const [name, handle] of directoryHandle.entries()) {
            if (handle.kind === 'file' && name.endsWith('.json')) {
                // Se é um arquivo que deveria estar em pasta
                const filePath = getFilePath(name);
                if (filePath.folder) {
                    console.log(`📦 Migrando ${name} para ${filePath.folder}/${filePath.fileName}`);
                    
                    // Ler arquivo antigo
                    const file = await handle.getFile();
                    const data = JSON.parse(await file.text());
                    
                    // Salvar na nova estrutura
                    await saveJsonFile(name, data);
                    
                    // Opcional: remover arquivo antigo (descomente se quiser)
                    // await directoryHandle.removeEntry(name);
                }
            }
        }
        
        console.log('✅ Migração concluída');
    } catch (err) {
        console.error('❌ Erro na migração:', err);
    }
}

async function saveJsonFileWithFallback(fileName, data) {
    if (directoryHandle) {
        return await saveJsonFile(fileName, data);
    } else {
        // Fallback: salvar em memória
        memoryStorage[fileName] = JSON.parse(JSON.stringify(data));
        console.warn(`Salvando ${fileName} apenas em memória`);
        return true;
    }
}

async function loadJsonFileWithFallback(fileName, defaultValue = {}) {
    if (directoryHandle) {
        return await loadJsonFile(fileName, defaultValue);
    } else {
        // Fallback: carregar da memória
        if (memoryStorage[fileName]) {
            return JSON.parse(JSON.stringify(memoryStorage[fileName]));
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
    
    statusDiv.className = `save-status-${type}`;
    statusDiv.textContent = message;
    statusDiv.style.display = 'block';
    
    setTimeout(() => {
        statusDiv.style.display = 'none';
    }, 3000);
}



// SUBSTITUA a função setupFileSystem por esta versão corrigida:

async function setupFileSystem(event) {
    event?.preventDefault();
    if (directoryHandle) {
        showSaveStatus('success', '✅ Sistema já configurado!');
        return;
    }
    if (!('showDirectoryPicker' in window)) {
        alert('❌ Navegador não suporta File System API.');
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
        await saveDirectoryHandle(newHandle);
        await ensureDirectoryStructure();
        await migrateMemoryToFilesFixed();
        showSaveStatus('success', `✅ Configurado! Salvando em: ${newHandle.name}`);
        updateFileSystemStatusFixed();
    } catch (err) {
        console.error('Erro:', err);
        showSaveStatus('error', err.name === 'AbortError' ? '⚠️ Seleção cancelada.' : `❌ Erro: ${err.message}`);
    }
}

async function migrateMemoryToFilesFixed() {
    console.log('📦 Iniciando migração...');
    
    // Primeiro migrar estrutura antiga se existir
    await migrateToNewStructure();
    
    let migratedCount = 0;
    const filesToMigrate = Object.keys(memoryStorage);

    for (const fileName of filesToMigrate) {
        if (memoryStorage[fileName] && typeof memoryStorage[fileName] === 'object') {
            const success = await saveJsonFile(fileName, memoryStorage[fileName]);
            if (success) migratedCount++;
        } else {
            console.warn(`⚠️ Dados inválidos em ${fileName}, pulando...`);
        }
    }

    console.log(`✅ Migração concluída: ${migratedCount}/${filesToMigrate.length} arquivos`);
    showSaveStatus('success', `✅ ${migratedCount} arquivo(s) migrado(s)`);
}

// PROBLEMA 3: Função para atualizar status do sistema de arquivos
function updateFileSystemStatusFixed() {
    const setupBtn = document.getElementById('setupFileSystemBtn');
    const statusDiv = document.getElementById('saveStatus');

    if (directoryHandle) {
        setupBtn.textContent = '✅ Configurado';
        setupBtn.style.background = 'linear-gradient(45deg,rgb(23, 121, 89),rgb(16, 91, 68))';
        if (statusDiv) {
            statusDiv.className = 'save-status-success';
            statusDiv.textContent = `💾 Salvando em: ${directoryHandle.name}`;
            statusDiv.style.display = 'block';
        }
    } else {
        setupBtn.textContent = '📁 Configurar';
        setupBtn.style.background = 'linear-gradient(45deg, #f59e0b, #d97706)';
        if (statusDiv) {
            statusDiv.className = 'save-status-warning';
            statusDiv.textContent = '⚠️ Dados em memória';
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

