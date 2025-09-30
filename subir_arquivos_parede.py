import sys
import io
# Configura UTF-8 para Windows
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')
import os
import shutil
import tempfile
import subprocess
import json
from datetime import datetime

REPO_SSH = "git@github.com:gabrielalmeidac3/parede_vd40.git"
BRANCH = "main"
EXCLUIR = [""]

def salvar_execucao():
    agora = datetime.now()
    dados = {
        "ultima_execucao": agora.strftime("%d %b %y às %H:%M")
    }
    with open("ultima_execucao.json", "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, indent=2)

def copiar_conteudo(origem, destino):
    for item in os.listdir(origem):
        if item in EXCLUIR or item == ".git":
            continue
        origem_item = os.path.join(origem, item)
        destino_item = os.path.join(destino, item)

        if os.path.isdir(origem_item):
            if os.path.exists(destino_item) and destino_item.endswith(".git") == False:
                shutil.rmtree(destino_item)
            if not os.path.exists(destino_item):
                shutil.copytree(origem_item, destino_item)
        else:
            shutil.copy2(origem_item, destino_item)

def main():
    # Ocultar janelas no Windows
    startupinfo = None
    if sys.platform == 'win32':
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startupinfo.wShowWindow = subprocess.SW_HIDE
    pasta_atual = os.path.abspath(os.path.dirname(__file__))
    temp_dir = tempfile.mkdtemp()

    try:
        print("📁 Clonando repositório...", flush=True)
        subprocess.run(["git", "clone", REPO_SSH, temp_dir], check=True, startupinfo=startupinfo)

        repo_dir = os.path.join(temp_dir)

        print("📄 Copiando arquivos para o repositório (ignorando index.html)...")
        copiar_conteudo(pasta_atual, repo_dir)

        print("🔃 Fazendo commit e push...")
        subprocess.run(["git", "add", "."], cwd=repo_dir, check=True, startupinfo=startupinfo)
        subprocess.run(["git", "commit", "-m", "Atualização automática via script"], cwd=repo_dir, check=False, startupinfo=startupinfo)
        subprocess.run(["git", "push", "origin", BRANCH], cwd=repo_dir, check=True, startupinfo=startupinfo)

        print("✅ Arquivos enviados com sucesso!")
        print("💾 Salvando registro de execução...")
        salvar_execucao()

    except subprocess.CalledProcessError as e:
        print("❌ Erro durante o processo:", e)

    finally:
        print("🧹 Limpando arquivos temporários...")
        try:
            shutil.rmtree(temp_dir)
        except PermissionError:
            print("⚠️ Aviso: Não foi possível limpar pasta temporária (arquivos em uso)")
        except Exception as e:
            print(f"⚠️ Aviso ao limpar: {e}")
        print("🚀 Processo finalizado.")
       

if __name__ == "__main__":
    main()
