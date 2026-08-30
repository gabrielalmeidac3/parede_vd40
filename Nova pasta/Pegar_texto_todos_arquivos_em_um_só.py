import os

output_file = "combined_files.txt"
with open(output_file, 'w', encoding='utf-8') as outfile:
    for filename in os.listdir('.'):
        if filename != output_file and filename != "Pegar_texto_todos_arquivos_em_um_só.py":
            try:
                with open(filename, 'r', encoding='utf-8') as infile:
                    outfile.write(f"\n\n===== {filename} =====\n")
                    outfile.write(infile.read())
            except:
                try:
                    with open(filename, 'rb') as infile:
                        outfile.write(f"\n\n===== {filename} (Binary/Non-text) =====\n")
                        outfile.write("Conteúdo não legível\n")
                except Exception as e:
                    outfile.write(f"\n\n===== {filename} (Erro) =====\n")
                    outfile.write(f"Erro: {e}\n")