import subprocess
import sys

print("🔍 Procurando servidor da Parede da Vitória...")

# Buscar processos pythonw.exe
result = subprocess.run(
    ['wmic', 'process', 'where', "name='pythonw.exe'", 'get', 'ProcessId,CommandLine'],
    capture_output=True,
    text=True
)

# Procurar pelo servidor
lines = result.stdout.strip().split('\n')
pid_encontrado = None

for line in lines:
    if 'servidorsemterminal' in line:
        # Extrair o PID (último número da linha)
        parts = line.split()
        for part in reversed(parts):
            if part.isdigit():
                pid_encontrado = part
                break
        break

if pid_encontrado:
    print(f"✅ Encontrado! PID: {pid_encontrado}")
    print(f"🔪 Matando processo...")
    
    # Matar o processo
    subprocess.run(['taskkill', '/F', '/PID', pid_encontrado], check=True)
    
    print(f"✅ Servidor finalizado com sucesso!")
else:
    print("❌ Servidor da Parede da Vitória não está rodando")

input("\nPressione ENTER para sair...")