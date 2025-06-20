import os
import shutil
import tempfile
import subprocess

REPO_SSH = "git@github.com:gabrielalmeidac3/parede_vd40.git"
BRANCH = "main"
EXCLUIR = ["index.html"]

def copiar_conteudo(origem, destino):
    for item in os.listdir(origem):
        if item in EXCLUIR:
            continue
        origem_item = os.path.join(origem, item)
        destino_item = os.path.join(destino, item)

        if os.path.isdir(origem_item):
            if os.path.exists(destino_item):
                shutil.rmtree(destino_item)
            shutil.copytree(origem_item, destino_item)
        else:
            shutil.copy2(origem_item, destino_item)

def main():
    pasta_atual = os.path.abspath(os.path.dirname(__file__))
    temp_dir = tempfile.mkdtemp()

    try:
        print("📁 Clonando repositório...")
        subprocess.run(["git", "clone", REPO_SSH, temp_dir], check=True)

        repo_dir = os.path.join(temp_dir)

        print("📄 Copiando arquivos para o repositório (ignorando index.html)...")
        copiar_conteudo(pasta_atual, repo_dir)

        print("🔃 Fazendo commit e push...")
        subprocess.run(["git", "add", "."], cwd=repo_dir, check=True)
        subprocess.run(["git", "commit", "-m", "Atualização automática via script"], cwd=repo_dir, check=False)
        subprocess.run(["git", "push", "origin", BRANCH], cwd=repo_dir, check=True)

        print("✅ Arquivos enviados com sucesso!")

    except subprocess.CalledProcessError as e:
        print("❌ Erro durante o processo:", e)

    finally:
        print("🧹 Limpando arquivos temporários...")
        shutil.rmtree(temp_dir)
        print("🚀 Processo finalizado.")
        input("Pressione Enter para sair...")

if __name__ == "__main__":
    main()
