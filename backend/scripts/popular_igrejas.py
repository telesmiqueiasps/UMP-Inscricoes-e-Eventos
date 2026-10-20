import sys
import os

# Garantir que o Python encontre o módulo 'app'
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.stdout.reconfigure(encoding="utf-8")

from sqlalchemy import text
from app.core.database import SessionLocal, engine, Base
import app.models  # Carrega todos os modelos
from app.models.presbiterio import Presbiterio
from app.models.igreja import Igreja

DADOS_PLANILHA = """
1 IPB Patos;Presbitério Oeste da Paraíba
2 IPB Patos;Presbitério Oeste da Paraíba
4 IPB Patos;Presbitério Oeste da Paraíba
IPB Aliança;Presbitério Sul da Paraíba
IPB Bancários;Presbitério Sul da Paraíba
IPB Bayeux;Presbitério Sul da Paraíba
IPB Cajazeiras;Presbitério Oeste da Paraíba
IPB Catolé;Presbitério Borborema
IPB Central;Presbitério Borborema
IPB Cristo;Presbitério Sul da Paraíba
IPB Cruz das Armas;Presbitério Sul da Paraíba
IPB da IV;Presbitério Borborema
IPB Filadélfia;Presbitério Sul da Paraíba
IPB Funcionários;Presbitério Sul da Paraíba
IPB IPBI;Presbitério Leste da Paraíba
IPB Jaguaribe;Presbitério Sul da Paraíba
IPB Jardim;Presbitério Borborema
IPB Lagoa Seca;Presbitério Borborema
IPB Liberdade;Presbitério Borborema
IPB Mamanguape;Presbitério Paraíba
IPB Mandacaru;Presbitério Paraíba
IPB Mangabeira;Presbitério Leste da Paraíba
IPB Monte Santo;Presbitério Borborema
IPB Paulista;Presbitério Oeste da Paraíba
IPB Picuí;Presbitério Leste da Paraíba
IPB Poço Dantas;Presbitério Oeste da Paraíba
IPB Pombal;Presbitério Oeste da Paraíba
IPB Primeira JP;Presbitério Leste da Paraíba
IPB Santa Rita;Presbitério Paraíba
IPB Sapé;Presbitério Leste da Paraíba
IPB Sousa;Presbitério Oeste da Paraíba
IPB Tambay;Presbitério Paraíba
IPB Tibiri;Presbitério Paraíba
IPB Zona Norte;Presbitério Borborema
3 IPB Patos;Presbitério Oeste da Paraíba
Congregação Alagoa Nova;Presbitério Sul da Paraíba
Congregação Bessa;Presbitério Metropolitano da Paraíba
Congregação de Fagundes;Presbitério Borborema
Congregação de Massaranduba;Presbitério Borborema
Congregação do Araxá;Presbitério Borborema
Congregação do José Pinheiro;Presbitério Borborema
Congregação IPB Aparecida;Presbitério Oeste da Paraíba
Congregação IPB Conceição;Presbitério Oeste da Paraíba
Congregação Jacumã;Presbitério Paraíba
Congregação Mata Redonda;Presbitério Paraíba
Congregação Novo Milênio;Presbitério Sul da Paraíba
Congregação Presbiteriana de Betel;Presbitério Oeste da Paraíba
Congregação Presbiteriana Imburaninha;Presbitério Oeste da Paraíba
Congregação Presbiteriana Peniel;Presbitério Oeste da Paraíba
IPB São Bento;Presbitério Oeste da Paraíba
Congregação presbiteriana Texeira;Presbitério Oeste da Paraíba
Congregação Serra Branca;Presbitério Metropolitano da Paraíba
Congregação Soli deo Glória;Presbitério Sul da Paraíba
Congregação Sumé;Presbitério Metropolitano da Paraíba
Congregação Vila Feliz (cabedelo);Presbitério Metropolitano da Paraíba
IP Jardim Aeroporto;Presbitério Sul da Paraíba
IPB Altiplano;Presbitério Metropolitano da Paraíba
IPB Alto Branco;Presbitério Central da Paraíba
IPB Bairro dos Estados;Presbitério Metropolitano da Paraíba
IPB Boa Vista;Presbitério Borborema
IPB Cabedelo;Presbitério Paraíba
IPB Catolé do Zé Ferreira;Presbitério Borborema
IPB Cruz do Espirito Santo;Presbitério Paraíba
IPB Ebenézer;Presbitério João Pessoa
IPB Esperança;Presbitério Borborema
IPB Filadélfia Santa Terezinha - PE;Presbitério Oeste da Paraíba
IPB Ilha do Bispo;Presbitério Leste da Paraíba
IPB Intermares;Presbitério Metropolitano da Paraíba
IPB Jardim 13 de Maio;Presbitério João Pessoa
IPB Renascer;Presbitério Central da Paraíba
IPB Renascer em Queimadas;Presbitério Central da Paraíba
IPB Restauração;Presbitério João Pessoa
IPB Reviver;Presbitério João Pessoa
IPB Rio Tinto;Presbitério Sul da Paraíba
IPB Torrelândia;Presbitério Leste da Paraíba
IPB Zona Sul;Presbitério Central da Paraíba
IPB Areia;Presbitério Brejo da Paraíba
IPB Cong. Alagoinha;Presbitério Brejo da Paraíba
IPB Cong. Bananeiras;Presbitério Brejo da Paraíba
IPB Desterro;Presbitério Oeste da Paraíba
IPB Geisel;Presbitério Metropolitano da Paraíba
IPB Guarabira;Presbitério Brejo da Paraíba
IPB José Américo;Presbitério João Pessoa
IPB Lagoa de Roça;Presbitério Borborema
IPB Maanaim;Presbitério Brejo da Paraíba
IPB Memorial;Presbitério Paraíba
IPB Sapé;Presbitério João Pessoa
IPB Solânea;Presbitério Brejo da Paraíba
IPB Tambaú;Presbitério Metropolitano da Paraíba
"""

def executar_migracao():
    print("=== INICIANDO MIGRAÇÃO E VINCULAÇÃO DE IGREJAS ===")

    # 1. Garantir que as tabelas existam
    Base.metadata.create_all(bind=engine)
    print("-> Tabelas verificadas/criadas no banco de dados via SQLAlchemy.")

    # 1.1 Criar trigger para updated_at se não existir
    with engine.connect() as conn:
        conn.execute(text("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_trigger WHERE tgname = 'update_igrejas_updated_at'
                ) THEN
                    CREATE TRIGGER update_igrejas_updated_at
                    BEFORE UPDATE ON igrejas
                    FOR EACH ROW
                    EXECUTE FUNCTION update_updated_at_column();
                END IF;
            END $$;
        """))
        conn.commit()

    db = SessionLocal()
    try:
        # 2. Padronizar nomes de presbitérios no banco se necessário
        renomeacoes = {
            "Presbitério Sul Paraíba": "Presbitério Sul da Paraíba",
            "Presbitério Metropolitano": "Presbitério Metropolitano da Paraíba"
        }
        for nome_antigo, nome_novo in renomeacoes.items():
            presb = db.query(Presbiterio).filter(Presbiterio.nome == nome_antigo).first()
            if presb:
                print(f"-> Atualizando nome do presbitério ID {presb.id}: '{nome_antigo}' -> '{nome_novo}'")
                presb.nome = nome_novo
                db.commit()

        # 3. Mapear todos os presbitérios cadastrados (case-insensitive)
        todos_presbs = db.query(Presbiterio).all()
        mapa_presb = {p.nome.strip().lower(): p for p in todos_presbs}
        print(f"-> Presbitérios ativos no banco ({len(todos_presbs)}):")
        for p in sorted(todos_presbs, key=lambda x: x.nome):
            print(f"   [ID {p.id}] {p.nome}")

        # 4. Processar a planilha
        linhas = [l.strip() for l in DADOS_PLANILHA.strip().split("\n") if l.strip()]
        print(f"\n-> Processando {len(linhas)} igrejas da planilha...")

        inseridas = 0
        ja_existentes = 0
        erros = 0

        for idx, linha in enumerate(linhas, 1):
            partes = [p.strip().replace("\xa0", " ") for p in linha.split(";") if p.strip()]
            if len(partes) < 2:
                print(f"   [AVISO] Linha {idx} inválida: '{linha}'")
                erros += 1
                continue

            igreja_nome = partes[0]
            presb_nome = partes[1]

            # Buscar presbitério correspondente
            presb_obj = mapa_presb.get(presb_nome.lower())
            if not presb_obj:
                print(f"   [ERRO] Presbitério '{presb_nome}' não encontrado no banco de dados!")
                erros += 1
                continue

            # Verificar se já existe (idempotência)
            igreja_existente = db.query(Igreja).filter(
                Igreja.nome == igreja_nome,
                Igreja.presbiterio_id == presb_obj.id
            ).first()

            if igreja_existente:
                ja_existentes += 1
            else:
                nova_igreja = Igreja(nome=igreja_nome, presbiterio_id=presb_obj.id)
                db.add(nova_igreja)
                inseridas += 1

        db.commit()

        total_igrejas = db.query(Igreja).count()
        print("\n=== RESUMO DA OPERAÇÃO ===")
        print(f"Novas igrejas inseridas: {inseridas}")
        print(f"Igrejas já cadastradas: {ja_existentes}")
        print(f"Erros de mapeamento: {erros}")
        print(f"Total de igrejas agora no banco: {total_igrejas}")

    except Exception as e:
        db.rollback()
        print(f"\n[ERRO CRÍTICO] Falha ao executar migração: {e}")
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    executar_migracao()
