# Plataforma Web de Inscrições para Eventos

Plataforma Web SaaS completa para gerenciamento de inscrições em eventos, compreendendo backend em Python/FastAPI, banco PostgreSQL (Supabase), autenticação JWT, integrador de checkout InfinitePay, gerador de Pix EMV QRCPS, emissor de carnês de pagamento em PDF (ReportLab) e 3 aplicações Frontend em Vanilla JavaScript e CSS3 moderno (Pública, Área do Participante e Painel Admin).

---

## 📁 Estrutura do Monorepo

```text
inscricoes-evento/
├── backend/
│   ├── app/
│   │   ├── main.py                   # Ponto de entrada FastAPI e CORS
│   │   ├── core/                     # Configurações, Segurança JWT e Banco de Dados
│   │   │   ├── config.py
│   │   │   ├── security.py
│   │   │   └── database.py
│   │   ├── models/                   # Modelos SQLAlchemy 2 (ORM)
│   │   │   ├── usuario.py
│   │   │   ├── evento.py
│   │   │   ├── inscricao.py
│   │   │   ├── pagamento.py
│   │   │   └── parcela.py
│   │   ├── schemas/                  # Schemas Pydantic v2
│   │   ├── routers/                  # Endpoints da API v1
│   │   │   ├── auth.py
│   │   │   ├── admin.py
│   │   │   ├── inscricoes.py
│   │   │   ├── pagamentos.py
│   │   │   ├── webhook_infinitepay.py
│   │   │   └── usuario_area.py
│   │   ├── services/                 # Serviços e Regras de Negócio
│   │   │   ├── parcelamento.py       # Divisão de parcelas e ajuste de centavos
│   │   │   ├── pix.py                # Geração de Pix Copia e Cola + QR Code
│   │   │   ├── infinitepay.py        # Integração de checkout InfinitePay
│   │   │   └── pdf_generator.py      # Emissor de PDF de carnês via ReportLab
│   │   └── utils/
│   ├── alembic/                      # Migrações do banco de dados
│   ├── alembic.ini
│   ├── requirements.txt
│   ├── render.yaml                   # Configuração de deploy no Render
│   └── .env.example
├── frontend-public/                 # Site Público do Evento (Landing + Wizard de Inscrição)
│   ├── index.html
│   ├── inscricao.html
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   ├── api.js
│   │   ├── public.js
│   │   └── inscricao.js
│   └── netlify.toml                 # Configuração de deploy no Netlify
├── frontend-area-usuario/            # Área do Participante (Login + Dashboard + Carnês PDF)
│   ├── login.html
│   ├── dashboard.html
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── api.js
│       ├── auth.js
│       └── dashboard.js
├── frontend-admin/                   # Painel Administrativo (CRUD Eventos + Inscrições + Pagamentos)
│   ├── index.html
│   ├── inscricoes.html
│   ├── pagamentos.html
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── api.js
│       └── admin.js
├── .gitignore
└── README.md
```

---

## 🛠️ Tecnologias Utilizadas

### Backend
* **Python 3.12**
* **FastAPI**
* **SQLAlchemy 2** & **Alembic**
* **PostgreSQL (Supabase)**
* **ReportLab** (Geração de PDF do Carnê/Comprovante)
* **Qrcode** & **Pillow** (Geração de QR Code Pix em Base64 e Imagem)
* **JWT (PyJWT / Python-Jose)** & **Passlib (Bcrypt)**
* **Uvicorn**

### Frontend
* **HTML5** & **CSS3 Moderno** (Gradientes, CSS Variables, Glassmorphism, Responsividade sem Bootstrap)
* **JavaScript ES6+** com **Fetch API**

---

## 🚀 Como Executar Localmente

### 1. Configurar o Backend

Navegue até a pasta `backend`:

```bash
cd backend
```

Crie um ambiente virtual Python e ative-o:

```bash
# Windows
python -m venv venv
.\venv\Scripts\activate

# Linux / MacOS
python3 -m venv venv
source venv/bin/activate
```

Instale as dependências:

```bash
pip install -r requirements.txt
```

Crie o arquivo `.env` baseado no `.env.example`:

```bash
cp .env.example .env
```

Edite o arquivo `.env` ajustando a variável `DATABASE_URL` (pode ser o PostgreSQL do Supabase ou um banco local como `sqlite:///./sql_app.db` para testes rápidos).

Execute as migrações do banco com o Alembic (ou deixe a inicialização automática do FastAPI criar as tabelas):

```bash
alembic upgrade head
```

Inicie o servidor de desenvolvimento FastAPI:

```bash
uvicorn app.main:app --reload --port 8000
```

Acesse a documentação interativa OpenAPI em: [http://localhost:8000/docs](http://localhost:8000/docs)

---

### 2. Executar o Frontend

Como o frontend utiliza **JavaScript ES6 puro** e Fetch API, você pode servir as pastas através de qualquer servidor estático ou pela extensão **Live Server** do VS Code:

* **Site Público**: Abra `frontend-public/index.html` (ex: `http://localhost:5500/frontend-public/index.html`)
* **Área do Participante**: Abra `frontend-area-usuario/login.html`
* **Painel Administrativo**: Abra `frontend-admin/index.html`

> **Nota:** O primeiro usuário cadastrado via `/api/v1/auth/register` torna-se automaticamente Administrador (`is_admin: true`).

---

## ☁️ Instruções de Deploy

### 1. Banco de Dados PostgreSQL no Supabase
1. Crie um projeto gratuito em [Supabase](https://supabase.com/).
2. Vá em **Project Settings > Database** e copie a **Connection String (URI)** no formato Transaction Pooler ou Direct.
3. Cole a URI na variável `DATABASE_URL` do seu backend.

### 2. Deploy do Backend no Render
1. Conecte seu repositório GitHub ao [Render](https://render.com/).
2. Crie um novo **Web Service** selecionando o repositório.
3. O Render detectará automaticamente o arquivo `backend/render.yaml`.
4. Defina o Root Directory como `backend`.
5. Preencha as variáveis de ambiente (`DATABASE_URL`, `SECRET_KEY`, `INFINITEPAY_HANDLE`, `PIX_CHAVE`).

### 3. Deploy do Frontend no Netlify
1. Conecte o repositório ao [Netlify](https://www.netlify.com/).
2. Crie 3 sites ou publique cada pasta separadamente:
   - **Public Site**: Base directory = `frontend-public`
   - **Área do Usuário**: Base directory = `frontend-area-usuario`
   - **Painel Admin**: Base directory = `frontend-admin`
3. O arquivo `netlify.toml` garantirá o roteamento correto das páginas estáticas.

---

## 💳 Formas de Pagamento Suportadas

1. **Pix à Vista**: Gera o payload EMV QRCPS (Pix Copia e Cola) e a imagem do QR Code em Base64.
2. **InfinitePay**: Integração completa via cliente HTTP gerando links de checkout e recebimento assíncrono via webhook (`POST /api/v1/webhook/infinitepay`).
3. **Parcelado / Carnê próprio**: Divide o valor total em até N parcelas ajustando eventuais centavos na última parcela. Gera comprovante individual em PDF por parcela com dados do evento, participante, vencimento e QR Code Pix.

---

## 🔒 Licença e Direitos

Projeto desenvolvido como solução completa para a gestão de eventos e inscrições.
