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
