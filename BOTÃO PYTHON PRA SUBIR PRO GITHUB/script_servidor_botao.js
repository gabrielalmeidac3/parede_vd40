// Função para executar arquivo Python
async function executarPython(nomeArquivo = 'meu_script.py') {
    try {
        // Mostra loading
        const botao = document.getElementById('executar-btn');
        const resultado = document.getElementById('resultado');
        
        botao.disabled = true;
        botao.textContent = 'Executando...';
        resultado.innerHTML = '<p>Executando código Python...</p>';
        
        // Faz a requisição POST para o servidor
        const response = await fetch('/executar-python', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                arquivo: nomeArquivo
            })
        });
        
        const data = await response.json();
        
        // Mostra o resultado
        if (data.sucesso) {
            resultado.innerHTML = `
                <div class="sucesso">
                    <h3>Executado com sucesso!</h3>
                    <h4>Saída:</h4>
                    <pre>${data.stdout}</pre>
                    ${data.stderr ? `<h4>Erros/Avisos:</h4><pre class="erro">${data.stderr}</pre>` : ''}
                </div>
            `;
        } else {
            resultado.innerHTML = `
                <div class="erro">
                    <h3>Erro na execução:</h3>
                    <pre>${data.erro}</pre>
                </div>
            `;
        }
        
    } catch (error) {
        document.getElementById('resultado').innerHTML = `
            <div class="erro">
                <h3>Erro de conexão:</h3>
                <pre>${error.message}</pre>
            </div>
        `;
    } finally {
        // Restaura o botão
        const botao = document.getElementById('executar-btn');
        botao.disabled = false;
        botao.textContent = 'Executar Python';
    }
}

// Event listener para o botão
document.addEventListener('DOMContentLoaded', function() {
    const botao = document.getElementById('executar-btn');
    if (botao) {
        botao.addEventListener('click', () => {
            executarPython('meu_script.py'); // Especifica o arquivo a ser executado
        });
    }
});