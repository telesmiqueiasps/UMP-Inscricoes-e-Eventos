-- ====================================================================
-- SCHEMA COMPLETO PARA POSTGRESQL / SUPABASE
-- Plataforma Web de Inscrições para Eventos
-- ====================================================================

-- 1. Tabela de Usuários
CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(150) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    senha_hash VARCHAR(255) NOT NULL,
    cpf VARCHAR(14) UNIQUE,
    telefone VARCHAR(20),
    is_admin BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_usuarios_email ON usuarios(email);
CREATE INDEX IF NOT EXISTS ix_usuarios_cpf ON usuarios(cpf);

-- 2. Tabela de Eventos
CREATE TABLE IF NOT EXISTS eventos (
    id SERIAL PRIMARY KEY,
    titulo VARCHAR(200) NOT NULL,
    descricao TEXT,
    data_inicio TIMESTAMP WITH TIME ZONE NOT NULL,
    data_fim TIMESTAMP WITH TIME ZONE NOT NULL,
    local VARCHAR(255),
    valor NUMERIC(10, 2) NOT NULL,
    max_participantes INTEGER,
    max_parcelas INTEGER DEFAULT 1 NOT NULL,
    ativo BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabela de Inscrições
CREATE TABLE IF NOT EXISTS inscricoes (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    evento_id INTEGER NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'PENDENTE' NOT NULL,
    forma_pagamento VARCHAR(50),
    valor_total NUMERIC(10, 2) NOT NULL,
    dados_extras JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_inscricoes_usuario_id ON inscricoes(usuario_id);
CREATE INDEX IF NOT EXISTS ix_inscricoes_evento_id ON inscricoes(evento_id);

-- 3.1. Tabela de Triagem de Inscrições (Drafts Pendentes de Pagamento)
CREATE TABLE IF NOT EXISTS inscricoes_triagem (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    evento_id INTEGER NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'PENDENTE_PAGAMENTO' NOT NULL,
    forma_pagamento VARCHAR(50),
    num_parcelas INTEGER DEFAULT 1 NOT NULL,
    data_primeira_parcela DATE,
    valor_total NUMERIC(10, 2) NOT NULL,
    dados_extras JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_inscricoes_triagem_usuario_id ON inscricoes_triagem(usuario_id);
CREATE INDEX IF NOT EXISTS ix_inscricoes_triagem_evento_id ON inscricoes_triagem(evento_id);

-- 4. Tabela de Pagamentos
CREATE TABLE IF NOT EXISTS pagamentos (
    id SERIAL PRIMARY KEY,
    inscricao_id INTEGER NOT NULL REFERENCES inscricoes(id) ON DELETE CASCADE,
    forma_pagamento VARCHAR(50) NOT NULL,
    valor NUMERIC(10, 2) NOT NULL,
    status VARCHAR(50) DEFAULT 'PENDENTE' NOT NULL,
    qr_code_pix TEXT,
    copia_cola_pix TEXT,
    transaction_nsu VARCHAR(100),
    receipt_url VARCHAR(500),
    order_nsu VARCHAR(100),
    invoice_slug VARCHAR(250),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_pagamentos_inscricao_id ON pagamentos(inscricao_id);
CREATE INDEX IF NOT EXISTS ix_pagamentos_order_nsu ON pagamentos(order_nsu);

-- 5. Tabela de Parcelas
CREATE TABLE IF NOT EXISTS parcelas (
    id SERIAL PRIMARY KEY,
    pagamento_id INTEGER NOT NULL REFERENCES pagamentos(id) ON DELETE CASCADE,
    numero INTEGER NOT NULL,
    vencimento DATE NOT NULL,
    valor NUMERIC(10, 2) NOT NULL,
    qr_code_pix TEXT,
    copia_cola_pix TEXT,
    status VARCHAR(50) DEFAULT 'PENDENTE' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_parcelas_pagamento_id ON parcelas(pagamento_id);

-- 6. Tabela de Triagem de Diárias (Drafts de Diárias Pendentes de Pagamento)
CREATE TABLE IF NOT EXISTS diarias_triagem (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    evento_id INTEGER NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
    dias_selecionados JSONB NOT NULL,
    quantidade_dias INTEGER DEFAULT 1 NOT NULL,
    valor_total NUMERIC(10, 2) NOT NULL,
    status VARCHAR(50) DEFAULT 'PENDENTE_PAGAMENTO' NOT NULL,
    forma_pagamento VARCHAR(50) DEFAULT 'INFINITEPAY' NOT NULL,
    dados_extras JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_diarias_triagem_usuario_id ON diarias_triagem(usuario_id);
CREATE INDEX IF NOT EXISTS ix_diarias_triagem_evento_id ON diarias_triagem(evento_id);

-- 7. Tabela Oficial de Inscrições por Diária (Confirmadas)
CREATE TABLE IF NOT EXISTS inscricoes_diarias (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    evento_id INTEGER NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
    dias_selecionados JSONB NOT NULL,
    quantidade_dias INTEGER DEFAULT 1 NOT NULL,
    valor_total NUMERIC(10, 2) NOT NULL,
    status VARCHAR(50) DEFAULT 'CONFIRMADA' NOT NULL,
    forma_pagamento VARCHAR(50) DEFAULT 'INFINITEPAY' NOT NULL,
    dados_extras JSONB,
    codigo_checkin VARCHAR(100) UNIQUE,
    checkin_realizado BOOLEAN DEFAULT FALSE NOT NULL,
    checkin_data TIMESTAMP WITH TIME ZONE,
    transaction_nsu VARCHAR(100),
    receipt_url VARCHAR(500),
    order_nsu VARCHAR(100),
    invoice_slug VARCHAR(250),
    paid_amount NUMERIC(10, 2),
    capture_method VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_inscricoes_diarias_usuario_id ON inscricoes_diarias(usuario_id);
CREATE INDEX IF NOT EXISTS ix_inscricoes_diarias_evento_id ON inscricoes_diarias(evento_id);
CREATE INDEX IF NOT EXISTS ix_inscricoes_diarias_checkin ON inscricoes_diarias(codigo_checkin);

-- 8. Tabela de Presbitérios
CREATE TABLE IF NOT EXISTS presbiterios (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(150) NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS ix_presbiterios_nome ON presbiterios(nome);

-- 9. Tabela de Igrejas
CREATE TABLE IF NOT EXISTS igrejas (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(200) NOT NULL,
    presbiterio_id INTEGER NOT NULL REFERENCES presbiterios(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_igrejas_presbiterio_id ON igrejas(presbiterio_id);
CREATE INDEX IF NOT EXISTS ix_igrejas_nome ON igrejas(nome);

-- 10. Tabela de Gincanas
CREATE TABLE IF NOT EXISTS gincanas (
    id SERIAL PRIMARY KEY,
    evento_id INTEGER REFERENCES eventos(id) ON DELETE SET NULL,
    titulo VARCHAR(200) DEFAULT 'Gincana UMP' NOT NULL,
    ativa BOOLEAN DEFAULT TRUE NOT NULL,
    nome_equipe_1 VARCHAR(100) DEFAULT 'Equipe 1' NOT NULL,
    cor_equipe_1 VARCHAR(30) DEFAULT '#2563EB' NOT NULL,
    nome_equipe_2 VARCHAR(100) DEFAULT 'Equipe 2' NOT NULL,
    cor_equipe_2 VARCHAR(30) DEFAULT '#DC2626' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_gincanas_evento_id ON gincanas(evento_id);
CREATE INDEX IF NOT EXISTS ix_gincanas_ativa ON gincanas(ativa);

-- 11. Tabela de Pontos da Gincana
CREATE TABLE IF NOT EXISTS gincana_pontos (
    id SERIAL PRIMARY KEY,
    gincana_id INTEGER NOT NULL REFERENCES gincanas(id) ON DELETE CASCADE,
    equipe INTEGER NOT NULL,
    titulo VARCHAR(200) NOT NULL,
    descricao TEXT,
    pontos INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_gincana_pontos_gincana_id ON gincana_pontos(gincana_id);
CREATE INDEX IF NOT EXISTS ix_gincana_pontos_created_at ON gincana_pontos(created_at);

-- ====================================================================
-- TRIGGERS DE ATUALIZAÇÃO AUTOMÁTICA DA COLUNA updated_at
-- ====================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE OR REPLACE TRIGGER update_usuarios_updated_at BEFORE UPDATE ON usuarios FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER update_eventos_updated_at BEFORE UPDATE ON eventos FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER update_inscricoes_updated_at BEFORE UPDATE ON inscricoes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER update_pagamentos_updated_at BEFORE UPDATE ON pagamentos FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER update_parcelas_updated_at BEFORE UPDATE ON parcelas FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER update_diarias_triagem_updated_at BEFORE UPDATE ON diarias_triagem FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER update_inscricoes_diarias_updated_at BEFORE UPDATE ON inscricoes_diarias FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER update_igrejas_updated_at BEFORE UPDATE ON igrejas FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER update_gincanas_updated_at BEFORE UPDATE ON gincanas FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

