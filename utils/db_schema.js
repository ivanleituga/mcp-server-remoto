// Schema do banco
const schema = `
-- Tabela contendo os dados da carta dos testes de formação
CREATE TABLE formationtestschartdata_view (
  "ID" INT,
  "Poço" TEXT,
  "Bacia" TEXT,
  "Categoria do Poço" TEXT,
  "ID do Teste de Formação" INT,
  "Número do Teste" TEXT,
  "Registrador" TEXT,
  "Pressão" REAL,
  "Tempo" REAL
);

-- Tabela contendo informações sobre a recuperação na coluna dos testes de formação
CREATE TABLE formationtestscolumnrecovery_view (
  "ID" INT,
  "Poço" TEXT,
  "Bacia" TEXT,
  "Categoria do Poço" TEXT,
  "ID do Teste de Formação" INT,
  "Fluido Recuperado" TEXT,
  "Volume" REAL,
  "Modo de Recuperação" TEXT
);

-- Tabela contendo informações sobre os dados de colchão dos testes de formação
CREATE TABLE formationtestscushioninfo_view (
  "ID" INT,
  "Poço" TEXT,
  "Bacia" TEXT,
  "Categoria do Poço" TEXT,
  "ID do Teste de Formação" INT,
  "Tipo" TEXT,
  "Altura (M)" REAL,
  "Densidade (LB/GAL)" REAL,
  "Concentração de Salinidade (MG/L NACL * 1000)" REAL
);

-- Tabela contendo informações sobre a coluna de perfuração dos testes de formação
CREATE TABLE formationtestsdrillingcolumn_view (
  "ID" INT,
  "Poço" TEXT,
  "Bacia" TEXT,
  "Categoria do Poço" TEXT,
  "ID do Teste de Formação" INT,
  "Equipamento" TEXT,
  "Capacidade (m³/m)" REAL,
  "Comprimento (m)" REAL
);

-- Tabela contendo os dados de fluido de perfuração dos testes de formação
CREATE TABLE formationtestsdrillingfluid_view (
  "ID" INT,
  "Poço" TEXT,
  "Bacia" TEXT,
  "Categoria do Poço" TEXT,
  "ID do Teste de Formação" INT,
  "Fonte dos Dados do Fluido" TEXT,
  "Fluido" TEXT,
  "Densidade" REAL,
  "Viscosidade Marsh" REAL,
  "Medida de pH" REAL,
  "Salinidade" REAL,
  "Porcentagem de Óleo Fluido" REAL,
  "Concentração de Cátion Ca+2" REAL,
  "Concentração de Mg+2" REAL,
  "Concentração de Traçador" REAL,
  "Tipo do Traçador" TEXT
);

-- Tabela contendo informações gerais sobre os testes de formação
CREATE TABLE formationtestsgeneralinfo_view (
  "ID do Teste de Formação" INT,
  "Poço" TEXT,
  "Bacia" TEXT,
  "Categoria do Poço" TEXT,
  "Data" DATE,
  "Tipo" TEXT,
  "CIA" TEXT,
  "Topo" REAL,
  "Base" REAL,
  "Profundidade do Poço de Teste" REAL,
  "Diâmetro" REAL,
  "Profundidade do Topo do Tampão" REAL,
  "Temperatura Máxima do Teste" REAL,
  "Fonte da Temperatura Máxima" TEXT,
  "Objetivo" TEXT,
  "Motivo" TEXT,
  "Resultado" TEXT,
  "Observações" TEXT
);

-- Tabela contendo informações sobre a interpretação da carta dos testes de formação
CREATE TABLE formationtestsinterpretationchart_view (
  "ID" INT,
  "Poço" TEXT,
  "Bacia" TEXT,
  "Categoria do Poço" TEXT,
  "ID do Teste de Formação" INT,
  "Período do Teste" TEXT,
  "Data de Interpretação" DATE,
  "Número do Registrador" INT,
  "Método de Interpretação" TEXT,
  "Temperatura Usada na Interpretação" REAL,
  "Fonte da Temperatura" TEXT,
  "Indicação de Barreira" TEXT,
  "Distância da Barreira" REAL,
  "Fluido Considerado" TEXT,
  "Vazão Final" REAL,
  "Vazão Média" REAL,
  "Viscosidade" REAL,
  "Razão Gás/Óleo" REAL,
  "Fator Volume de Formação" REAL,
  "Fator Desvio de Gás" REAL,
  "Vazão Absoluta do Gás" REAL,
  "Saturação Média de Água" REAL,
  "Espessura Permeável" REAL,
  "Porosidade Média" REAL,
  "Produtividade" REAL,
  "Razão de Produtividade" REAL,
  "Índice de Produtividade Mínimo" REAL,
  "Raio de Investigação" REAL,
  "Compressibilidade Total" REAL,
  "Pressão Inicial de Fluxo" REAL,
  "Pressão Final de Fluxo" REAL,
  "Pressão de Fluxo Média" REAL,
  "Pressão Estática Extrapolada" REAL,
  "Declividade Reta" REAL,
  "Efeito Película" REAL,
  "Transmissibilidade" REAL,
  "Permeabilidade Efetiva" REAL,
  "Dano de Formação" REAL,
  "Integral da Pressão de Fluxo P/ T=1H" REAL,
  "Integral da Pressão de Fluxo P/ TMS=0" REAL,
  "Coeficiente de Estocagem" REAL
);

-- Tabela de informações sobre os dados de surgência dos testes de formação
CREATE TABLE formationtestsnaturalflow_view (
  "ID" INT,
  "Poço" TEXT,
  "Bacia" TEXT,
  "Categoria do Poço" TEXT,
  "ID do Teste de Formação" INT,
  "Período" TEXT,
  "Intervalo de Tempo - Recuperação por Surgência" REAL,
  "Dados na Superfície" TEXT,
  "Pressão a Montante" REAL,
  "Pressão a Jusante" REAL,
  "Fluido Recuperado" TEXT,
  "Vazão" REAL
);

-- Tabela contendo os sumários dos períodos dos testes de formação
CREATE TABLE formationtestsperiodsummary_view (
  "ID" INT,
  "Poço" TEXT,
  "Bacia" TEXT,
  "Categoria do Poço" TEXT,
  "ID do Teste de Formação" INT,
  "Período" TEXT,
  "Pressão Inicial" REAL,
  "Pressão Final" REAL,
  "Intervalo de Tempo" REAL,
  "Volume Produzido" REAL,
  "Número do Registrador de Pressão" INT,
  "Indicador de Início de Período na Carta" INT,
  "Indicador de Fim de Período na Carta" INT
);

-- Tabela contendo informações sobre os registradores de pressão dos testes de formação
CREATE TABLE formationtestspressureregisters_view (
  "ID" INT,
  "Poço" TEXT,
  "Bacia" TEXT,
  "Categoria do Poço" TEXT,
  "ID do Teste de Formação" INT,
  "Número" INT,
  "Profundidade" REAL,
  "Tipo" TEXT,
  "Posição Relativa" TEXT,
  "Capacidade" REAL,
  "Valor M (kgf/cm²/pol)" REAL,
  "Valor A (kgf/cm²)" REAL,
  "Número do Relógio" TEXT,
  "Capacidade do Relógio" REAL
);

-- Tabela contendo informações sobre a amostragem e análise do recuperado dos testes de formação
CREATE TABLE formationtestssampleanalysis_view (
  "ID" INT,
  "Poço" TEXT,
  "Bacia" TEXT,
  "Categoria do Poço" TEXT,
  "ID do Teste de Formação" INT,
  "Posição da Coleta da Amostra" TEXT,
  "Tipo do Fluido" TEXT,
  "Fonte de Dados da Análise" TEXT,
  "Viscosidade" REAL,
  "API da Amostra a 60 F" REAL,
  "Concentração do Traçador de Amostra" REAL,
  "Tipo de Traçador" TEXT,
  "Concentração de H₂S da Amostra" REAL,
  "Concentração do Cátion Ca+2 da Amostra" REAL,
  "Concentração do Cátion Mg+2 da Amostra" REAL,
  "Volume Coletado Recuperado" REAL,
  "Densidade Relativa da Amostra" REAL,
  "RW a 75 F" REAL,
  "Porcentagem de Óleo da Amostra" REAL,
  "Medida de pH da Amostra" REAL,
  "Concentração de Salinidade na Amostra" REAL
);

-- Tabela contendo informações sobre perfis: aquisição/processamento
CREATE TABLE wellacquisitionlog_view (
  "ID" INT,
  "Poço" TEXT,
  "Bacia" TEXT,
  "Categoria do Poço" TEXT,
  "Código" INT,
  "Grupo" INT,
  "Tipo" TEXT,
  "Empresa" TEXT,
  "Corrida" INT,
  "Descida" CHAR(1),
  "Data" DATE,
  "Topo" REAL,
  "Cota Topo" REAL,
  "Base" REAL,
  "Cota Base" REAL,
  "Observações" TEXT
);

-- Tabela contendo informações sobre perfis: dados de teste a cabo (interpretação)
CREATE TABLE wellcabletestslog_view (
  "ID" INT,
  "Poço" TEXT,
  "Bacia" TEXT,
  "Categoria do Poço" TEXT,
  "Tipo de Perfil" TEXT,
  "Descida da Ferramenta" REAL,
  "Declividade da Reta" REAL,
  "Número da Corrida" INT,
  "Profundidade" REAL,
  "Cota Profundidade" REAL,
  "Qualidade" TEXT,
  "Fator de Volume" REAL,
  "Permeabilidade" REAL,
  "Transmissibilidade" REAL,
  "Razão Gás/Óleo" REAL,
  "Sobrecarga" TEXT,
  "Compressibilidade Total" REAL,
  "Porosidade (Perfis)" REAL,
  "Viscosidade do Fluido" REAL,
  "Pressão Estática" REAL,
  "Método" TEXT,
  "Resultado" TEXT,
  "Tempo de Fluxo" REAL
);

-- Tabela contendo informações sobre revestimentos
CREATE TABLE wellcasing_view (
  "ID" INT,
  "Poço" TEXT,
  "Bacia" TEXT,
  "Categoria do Poço" TEXT,
  "Tipo" TEXT,
  "Profundidade" REAL,
  "Cota Profundidade" REAL,
  "Diâmetro" TEXT,
  "Recuperação" TEXT
);

-- Tabela contendo informações sobre perdas de circulação
CREATE TABLE wellcircloss_view (
  "ID" INT,
  "Poço" TEXT,
  "Bacia" TEXT,
  "Categoria do Poço" TEXT,
  "Tipo" TEXT,
  "Topo" REAL,
  "Cota Topo" REAL,
  "Base" REAL,
  "Cota Base" REAL,
  "Valor da Perda" REAL
);

-- Tabela contendo informações sobre testemunhos
CREATE TABLE wellcore_view (
  "ID" INT,
  "Poço" TEXT,
  "Bacia" TEXT,
  "Categoria do Poço" TEXT,
  "Tipo de Testemunho" TEXT,
  "Número" REAL,
  "Topo" REAL,
  "Cota Topo" REAL,
  "Base" REAL,
  "Cota Base" REAL,
  "Recuperado" REAL,
  "Flag de Existência" INT,
  "Litoteca" TEXT
);

-- Tabela contendo informações sobre falhas
CREATE TABLE wellfault_view (
  "ID" INT,
  "Poço" TEXT,
  "Bacia" TEXT,
  "Categoria do Poço" TEXT,
  "Fonte da Interpretação" TEXT,
  "Data" DATE,
  "Profundidade" REAL,
  "Cota Profundidade" REAL,
  "Tipo da Falha" TEXT,
  "Método" TEXT,
  "Qualidade" TEXT,
  "Rejeito" REAL
);

-- Tabela contendo informações sobre contatos entre fluidos num poço
CREATE TABLE wellfluidcontacts_view (
  "ID" INT,
  "Poço" TEXT,
  "Bacia" TEXT,
  "Categoria do Poço" TEXT,
  "Tipo de Contato" TEXT,
  "Fonte da Interpretação" TEXT,
  "Data" DATE,
  "Topo" REAL,
  "Cota Topo" REAL,
  "Base" REAL,
  "Cota Base" REAL,
  "Método" TEXT,
  "Qualidade" TEXT
);

-- Tabela contendo informações sobre perfis: dados gerais de teste a cabo
CREATE TABLE wellgencabletestslog_view (
  "ID" INT,
  "Poço" TEXT,
  "Bacia" TEXT,
  "Categoria do Poço" TEXT,
  "Tipo de Perfil" INT,
  "Grupo de Perfis Combinados" INT,
  "Tipo de Packer" TEXT,
  "Número da Corrida" INT,
  "Tipo de Probe" TEXT,
  "Restrição da Abertura" TEXT,
  "Descida da Ferramenta" CHAR(1),
  "Tipo de Registrador" TEXT,
  "Colchão de Água" TEXT
);

-- Tabela contendo informações sobre indícios de hidrocarbonetos
CREATE TABLE wellhcshow_view (
  "ID" INT,
  "Poço" TEXT,
  "Bacia" TEXT,
  "Categoria do Poço" TEXT,
  "Tipo" TEXT,
  "Origem" TEXT,
  "Amostra" TEXT,
  "Topo" REAL,
  "Cota Topo" REAL,
  "Base" REAL,
  "Cota Base" REAL,
  "Modo de Ocorrência" TEXT,
  "Rocha" TEXT,
  "Porcentagem" REAL,
  "Tipo de Fluorescência" TEXT,
  "Cor" TEXT,
  "Tonalidade" TEXT,
  "Velocidade de Disseminação" TEXT,
  "Modo de Disseminação" TEXT,
  "UGT" REAL,
  "UGP" REAL
);

-- Tabela contendo informações sobre perfis: registro de amostra lateral
CREATE TABLE welllateralcorelog_view (
  "ID" INT,
  "Poço" TEXT,
  "Bacia" TEXT,
  "Categoria do Poço" TEXT,
  "Perfil" INT,
  "Corrida" INT,
  "Descida" CHAR(1),
  "Profundidade da Amostra" REAL,
  "Cota Profundidade da Amostra" REAL,
  "Tipo de Amostra" TEXT,
  "Número da Amostra" INT,
  "Finalidade da Amostra" TEXT,
  "Recuperação da Amostra" TEXT,
  "Litoteca" TEXT
);

-- Tabela contendo informações sobre litologia
CREATE TABLE welllithology_view (
  "ID" INT,
  "Poço" TEXT,
  "Bacia" TEXT,
  "Categoria do Poço" TEXT,
  "Topo" REAL,
  "Cota Topo" REAL,
  "Verticalizado?" BOOL,
  "Base" REAL,
  "Cota Base" REAL,
  "Rocha" TEXT,
  "Cor" TEXT,
  "Tonalidade" TEXT,
  "Granulometria" TEXT,
  "Arredondamento" TEXT
);

-- Tabela contendo informações sobre unidades medidas
CREATE TABLE wellmeasuredunits_view (
  "ID" INT,
  "Poço" TEXT,
  "Bacia" TEXT,
  "Categoria do Poço" TEXT,
  "Tipo" TEXT,
  "Qualidade" TEXT,
  "Método" TEXT,
  "Nome" TEXT,
  "Código" INT,
  "Topo" REAL,
  "Descrição do Topo" TEXT,
  "Base" REAL,
  "Descrição da Base" TEXT,
  "E/W" TEXT,
  "N/S" TEXT,
  "Fonte da Interpretação" TEXT,
  "Data" DATE
);

-- Tabela contendo informações sobre objetivos e resultados
CREATE TABLE wellobjective_view (
  "ID" INT,
  "Poço" TEXT,
  "Bacia" TEXT,
  "Categoria do Poço" TEXT,
  "Sequência" INT,
  "Código da Unidade" INT,
  "Nome da Unidade" TEXT,
  "Status Inicial do Objetivo" TEXT,
  "Resultado do Objetivo" TEXT
);

-- Tabela contendo informações sobre perfis: registro de observações de teste/pré-teste
CREATE TABLE wellobservationslog_view (
  "ID" INT,
  "Poço" TEXT,
  "Bacia" TEXT,
  "Categoria do Poço" TEXT,
  "Tipo de Perfil" INT,
  "Número da Corrida" INT,
  "Grupo de Perfis Combinados" INT,
  "Descida da Ferramenta" CHAR(1),
  "Profundidade do Teste/Pré-Teste" REAL,
  "Cota da Profundidade do Teste/Pré-Teste" REAL,
  "Observações de Perfilagem" TEXT
);

-- Tabela contendo informações sobre o intervalo de espessura permoporosa por fluido
CREATE TABLE wellpermoporouswidth_view (
  "ID" INT,
  "Poço" TEXT,
  "Bacia" TEXT,
  "Categoria do Poço" TEXT,
  "Fonte da Interpretação" TEXT,
  "Data" TEXT,
  "Fluido" TEXT,
  "Qualidade" TEXT,
  "Topo" REAL,
  "Cota Topo" REAL,
  "Base" REAL,
  "Cota Base" REAL,
  "Indicador de Argilosidade" TEXT,
  "Espessura Permoporosa" REAL,
  "Fonte de Porosidade" TEXT,
  "Cut-off Argilosidade" REAL,
  "Fonte de Saturação" TEXT,
  "Cut-off Porosidade" REAL,
  "Argilosidade" REAL,
  "Porosidade" REAL,
  "Espessura Porosa" REAL,
  "Cut-off Saturação Água" REAL,
  "Saturação Água" REAL,
  "Espessura Porosa de HC" REAL,
  "Espessura Porosa de Água" REAL
);

-- Tabela contendo informações sobre intervalos tamponeados
CREATE TABLE wellpluggedintervals_view (
  "ID" INT,
  "Poço" TEXT,
  "Bacia" TEXT,
  "Categoria do Poço" TEXT,
  "Topo" REAL,
  "Cota Topo" REAL,
  "Base" REAL,
  "Cota Base" REAL,
  "Tipo de Tampão" TEXT
);

-- Tabela contendo informações sobre perfis: registros de gradiente de pressão
CREATE TABLE wellpressuregradlog_view (
  "ID" INT,
  "Poço" TEXT,
  "Bacia" TEXT,
  "Categoria do Poço" TEXT,
  "Topo" REAL,
  "Cota Topo" REAL,
  "Base" REAL,
  "Cota Base" REAL,
  "Gradiente" REAL,
  "Fluido" TEXT,
  "Qualidade" TEXT,
  "Método" TEXT
);

-- Tabela contendo informações sobre perfis: dados de pré-testes (tomadas de pressão)
CREATE TABLE wellpretestslog_view (
  "ID" INT,
  "Poço" TEXT,
  "Bacia" TEXT,
  "Categoria do Poço" TEXT,
  "Tipo de Perfil" INT,
  "Número do Pré-teste" INT,
  "Número da Corrida" INT,
  "Pressão Hidrostática" REAL,
  "Pressão Fluxo-1" REAL,
  "Pressão Fluxo-2" REAL,
  "Pressão Estática" REAL,
  "Profundidade Medida" REAL,
  "Cota Profundidade" REAL,
  "Grupo de Perfis Combinados" INT,
  "Qualidade da Estatica" TEXT,
  "Descida da Ferramenta" CHAR(1)
);

-- Tabela contendo informações sobre o histórico da reclassificação
CREATE TABLE wellreclasshistory_view (
  "ID" INT,
  "Poço" TEXT,
  "Bacia" TEXT,
  "Categoria do Poço" TEXT,
  "Tipo" TEXT,
  "Data" DATE,
  "Status" TEXT
);

-- Tabela contendo informações sobre zonas reservatório (desenvolvimento)
CREATE TABLE wellreservoirzones_view (
  "ID" INT,
  "Poço" TEXT,
  "Bacia" TEXT,
  "Categoria do Poço" TEXT,
  "Código" INT,
  "Zona" TEXT,
  "Fonte da Interpretação" TEXT,
  "Topo" REAL,
  "Cota Topo" REAL,
  "Qualidade do Topo" TEXT,
  "Base" REAL,
  "Cota Base" REAL,
  "Qualidade da Base" TEXT,
  "Método" TEXT,
  "Qualidade Geral" TEXT,
  "Topo Permoporoso" REAL,
  "Cota Topo Permoporoso" REAL,
  "Base Permoporosa" REAL,
  "Cota Base Permoporosa" REAL,
  "Motivo da Ausência" TEXT,
  "Curvas de Permoporosidade" TEXT,
  "Comentários" TEXT,
  "Topo Comentários" REAL
);

-- Tabela contendo informações sobre perfis: dados de referência sísmica
CREATE TABLE wellseismiclog_view (
  "ID" INT,
  "Poço" TEXT,
  "Bacia" TEXT,
  "Categoria do Poço" TEXT,
  "Número da Corrida" INT,
  "Tipo de Perfil" INT,
  "Descida da Ferramenta" REAL,
  "Profundidade" REAL,
  "Cota Profundidade" REAL,
  "Tempo Sísmico" REAL
);

-- Tabela contendo informações sobre perfis: registro de dados de temperatura extrapolada
CREATE TABLE welltemperaturelog_view (
  "ID" INT,
  "Poço" TEXT,
  "Bacia" TEXT,
  "Categoria do Poço" TEXT,
  "Corrida" INT,
  "Método de Extrapolação" TEXT,
  "Temperatura Extrapolada" REAL,
  "Profundidade" REAL,
  "Cota Profundidade" REAL,
  "Gradiente Geotérmico" REAL
);

-- Tabela contendo informações sobre perfis: dados de testes (amostragem e análise)
CREATE TABLE welltestslog_view (
  "ID" INT,
  "Poço" TEXT,
  "Bacia" TEXT,
  "Categoria do Poço" TEXT,
  "Tipo de Perfil" INT,
  "Número Sequencial da Câmara" INT,
  "Tipo de Amostra" TEXT,
  "API do Óleo" REAL,
  "Número da Corrida" INT,
  "Fluido Recuperado" TEXT,
  "Tempo de Amostragem" REAL,
  "Descida da Ferramenta" CHAR(1),
  "Número do Teste" INT,
  "Profundidade do Teste" REAL,
  "Cota da Profundidade do Teste" REAL,
  "Capacidade da Câmara" TEXT,
  "Tipo do HC Líquido" TEXT,
  "Volume HC Líquido" REAL,
  "Tipo do Traçador" TEXT,
  "Salinidade do Traçador" REAL,
  "Volume Fase Aquosa" REAL,
  "Densidade Fase Aquosa" REAL,
  "Salinidade Fase Aquosa" REAL,
  "pH" REAL,
  "Resistividade (75°F)" REAL,
  "%C1" REAL,
  "%C2" REAL,
  "%C3" REAL,
  "%C4" REAL,
  "%C5" REAL,
  "Teor H2S" REAL,
  "Teor Hidrox" REAL,
  "Teor Hidrox+CO3" REAL,
  "Teor Ca++" REAL,
  "Teor Mg++" REAL
);

-- Tabela contendo informações sobre unidades verticalizadas
CREATE TABLE wellverticalunits_view (
  "ID" INT,
  "Poço" TEXT,
  "Bacia" TEXT,
  "Categoria do Poço" TEXT,
  "Tipo" TEXT,
  "Qualidade" TEXT,
  "Nome" TEXT,
  "Código" INT,
  "Topo" REAL,
  "Cota Topo" REAL,
  "Descrição do Topo" TEXT,
  "Base" REAL,
  "Cota Base" REAL,
  "Descrição da Base" TEXT,
  "Método" TEXT,
  "Tempo" TEXT,
  "Fonte da Interpretação" TEXT,
  "Data" DATE
);

-- Tabela contendo informações sobre registros de cabeçalho de perfis
CREATE TABLE wellheaderlog_view (
  "ID" INT,
  "Poço" TEXT,
  "Bacia" TEXT,
  "Categoria do Poço" TEXT,
  "Grupo do Perfil" TEXT,
  "Execução" INT,
  "Serviço" TEXT,
  "Empresa" TEXT,
  "Data Inicial" DATE,
  "Data Final" DATE,
  "Topo Medido" REAL,
  "Base Medida" REAL,
  "Cota do Topo" REAL,
  "Cota da Base" REAL,
  "Topo Reprocessado" REAL,
  "Base Reprocessada" REAL,
  "Cota do Topo Reprocessado" REAL,
  "Cota da Base Reprocessada" REAL,
  "Unidade Topo/Base" TEXT,
  "Observações" TEXT
);

-- Tabela contendo informações gerais básicas dos poços
CREATE TABLE wellgeneralinfo_view (
  "ID" INT,
  "Poço" TEXT,
  "Bacia" TEXT,
  "Categoria do Poço" TEXT,
  "ACS Risco" TEXT,
  "B.A.P" TEXT,
  "Bacia (AGP)" TEXT,
  "Cadastro" TEXT,
  "Campo" TEXT,
  "Classificação" TEXT,
  "Código do Poço" TEXT,
  "Contrato de Risco" TEXT,
  "Coordenadas UTM Base" TEXT,
  "Coordenadas UTM Fundo" TEXT,
  "Coordenadas UTM Locação" TEXT,
  "Dados Locação" TEXT,
  "Data Aprovação Locação" TEXT,
  "Data Liberação Sonda" TEXT,
  "Datum" TEXT,
  "Datum Locação" TEXT,
  "Direcional?" TEXT,
  "Distrito" TEXT,
  "Documento Aprovação Locação" TEXT,
  "Empresa Operadora 1/2" TEXT,
  "Estado" TEXT,
  "Formação P.F." TEXT,
  "Identificador" TEXT,
  "Início" TEXT,
  "Latitude" TEXT,
  "Longitude" TEXT,
  "Maior Profundidade" TEXT,
  "Meridiano Central UTM Base" TEXT,
  "Meridiano Central Locação" TEXT,
  "Meridiano Central" TEXT,
  "Mesa Rotativa" TEXT,
  "Metros Perfurados" TEXT,
  "Município" TEXT,
  "Nome" TEXT,
  "P.F. Sondador" TEXT,
  "Profundidade Máxima Perfurada" TEXT,
  "Quadrícula" TEXT,
  "Reclassificação" TEXT,
  "SEDOC" TEXT,
  "Situação da Locação" TEXT,
  "Sonda" TEXT,
  "Término" TEXT,
  "Terra / Mar" TEXT,
  "Última Reclassificação" TEXT
);

-- Tabela contendo informações sobre arquivos disponíveis referentes às bacias
CREATE TABLE basinfiles_view (
  "ID" INT,
  "Bacia" TEXT,
  "Nome do Arquivo" TEXT,
  "Categoria do Arquivo" TEXT,
  "Extensão do Arquivo" TEXT,
  "Caminho do Arquivo" TEXT,
  "URL de Download" TEXT
);

-- Tabela contendo informações sobre os arquivos disponíveis referentes aos poços
CREATE TABLE wellfiles_view (
  "ID" INT,
  "Poço" TEXT,
  "Bacia" TEXT,
  "Categoria do Poço" TEXT,
  "Nome do Arquivo" TEXT,
  "Categoria do Arquivo" TEXT,
  "Extensão do Arquivo" TEXT,
  "Caminho do Arquivo" TEXT,
  "URL de Download" TEXT
);

-- Tabela contendo os dados das curvas dos poços, retirados dos arquivos DLIS 
CREATE TABLE dlis_metadata_view (
  "ID" INT,
  "Poço" TEXT,
  "Bacia" TEXT,
  "Corrida" TEXT,
  "Data de Criação da Corrida" TIMESTAMP,
  "Frame" TEXT,
  "Espaçamento" DOUBLE,
  "Unidade de Espaçamento" TEXT,
  "Indice Minimo" DOUBLE,
  "Unidade Indice Minimo" TEXT,
  "Indice Maximo" DOUBLE,
  "Unidade Indice Maximo" TEXT,
  "Código da Curva" TEXT,
  "Nome da Curva" TEXT,
  "Categoria" TEXT,
  "Url de Download" TEXT,
  "Arquivo HDF5" TEXT
);
`;

module.exports = {
  schema
};
