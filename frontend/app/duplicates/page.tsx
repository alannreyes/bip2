'use client';

import { useState, useEffect } from 'react';
import { useCollections } from '@/hooks/use-collections';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Header } from '@/components/header';
import {
  Search,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Calendar,
  Package,
  DollarSign,
  Copy,
  Settings,
} from 'lucide-react';
import Link from 'next/link';
import { duplicatesApi } from '@/lib/api';

interface Product {
  id: string | number;
  score: number;
  payload: Record<string, any>;
}

interface DuplicateClassification {
  category: 'real_duplicate' | 'size_variant' | 'color_variant' | 'model_variant' | 'description_variant' | 'review_needed';
  confidence: number;
  reason: string;
  differences: string[];
  recommendation: 'merge' | 'keep_both' | 'review';
}

interface DuplicateGroup {
  products: Product[];
  avgSimilarity: number;
  recommended: Product;
  duplicateIds: string[];
  aiClassification?: DuplicateClassification;
}

interface DuplicateReport {
  totalGroups: number;
  totalDuplicates: number;
  estimatedSavings: number;
  groups: DuplicateGroup[];
  categorySummary?: {
    real_duplicates: number;
    size_variants: number;
    color_variants: number;
    model_variants: number;
    description_variants: number;
    review_needed: number;
  };
}

export default function DuplicatesPage() {
  const { data: collections } = useCollections();
  const [selectedCollection, setSelectedCollection] = useState<string>('');
  const [similarityThreshold, setSimilarityThreshold] = useState(99);
  const [maxGroups, setMaxGroups] = useState(50);
  const [useAiClassification, setUseAiClassification] = useState(true); // AI enabled by default

  const [isDetecting, setIsDetecting] = useState(false);
  const [report, setReport] = useState<DuplicateReport | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Filters state
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({
    linea: '',
    familia: '',
    sub_familia: '',
    categoria: '',
  });
  const [availableFilterValues, setAvailableFilterValues] = useState<Record<string, string[]>>({
    linea: [],
    familia: [],
    sub_familia: [],
    categoria: [],
  });
  const [loadingFilters, setLoadingFilters] = useState(false);

  // Load filter values when collection changes
  useEffect(() => {
    const loadFilterValues = async () => {
      if (!selectedCollection) {
        setAvailableFilterValues({
          linea: [],
          familia: [],
          sub_familia: [],
          categoria: [],
        });
        return;
      }

      setLoadingFilters(true);
      try {
        const response = await duplicatesApi.getFilterValues(selectedCollection);
        setAvailableFilterValues(response.data);
      } catch (error) {
        console.error('Error loading filter values:', error);
      } finally {
        setLoadingFilters(false);
      }
    };

    loadFilterValues();
  }, [selectedCollection]);

  const copyToClipboard = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleDetect = async () => {
    if (!selectedCollection) {
      alert('Por favor selecciona una colección');
      return;
    }

    setIsDetecting(true);
    setReport(null);

    try {
      // Build filters object - only include non-empty values
      const activeFilters: Record<string, string> = {};
      Object.entries(filters).forEach(([key, value]) => {
        if (value && value.trim() !== '') {
          activeFilters[key] = value.trim();
        }
      });

      const response = await duplicatesApi.detect(
        selectedCollection,
        similarityThreshold / 100, // Convert percentage to decimal
        maxGroups,
        useAiClassification,
        Object.keys(activeFilters).length > 0 ? activeFilters : undefined
      );
      setReport(response.data);
    } catch (error: any) {
      console.error('Detection error:', error);
      alert(`Error al detectar duplicados: ${error.response?.data?.message || error.message}`);
    } finally {
      setIsDetecting(false);
    }
  };

  // Get important fields for comparison in priority order
  const getImportantFields = (payload: Record<string, any>): [string, any][] => {
    // Fields to exclude from display
    const excludeFields = ['id', 'linea', 'uso'];

    const priorityFields = [
      'descripcion',
      'description',
      'marca',
      'brand',
      'modelo',
      'model',
      'codigo',
      'codigo_fabricante',
      'codigo_proveedor',
      'sku',
      'categoria',
      'category',
      'familia',
      'proveedor',
      'supplier',
      'precio',
      'price',
      'precio_lista',
      'stock',
      'unidad',
      'presentacion',
      'talla',
      'size',
    ];

    const fields: [string, any][] = [];
    const allEntries = Object.entries(payload).filter(
      ([key]) => !key.startsWith('_') && !excludeFields.includes(key)
    );

    // Add priority fields first
    for (const field of priorityFields) {
      const entry = allEntries.find(([key]) => key === field);
      if (entry) {
        fields.push(entry);
      }
    }

    // Add remaining fields
    for (const entry of allEntries) {
      if (!priorityFields.includes(entry[0]) && !fields.find(f => f[0] === entry[0])) {
        fields.push(entry);
      }
    }

    return fields;
  };

  const getScoreReason = (product: Product): string[] => {
    const reasons: string[] = [];
    const payload = product.payload || {};

    const sales = parseInt(payload.ventas_3_anios || '0') || 0;
    if (sales > 0) {
      reasons.push(`${sales} ventas en 3 años`);
    }

    if (payload.fecha_ultima_venta) {
      try {
        const lastSale = new Date(payload.fecha_ultima_venta);
        const daysSince = Math.floor(
          (Date.now() - lastSale.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (daysSince <= 30) {
          reasons.push('Venta reciente (últimos 30 días)');
        } else if (daysSince <= 90) {
          reasons.push(`Última venta hace ${daysSince} días`);
        }
      } catch (e) {}
    }

    if (payload.en_stock === true || payload.en_stock === 'true') {
      reasons.push('En stock');
    }

    if (payload.precio_lista === true || payload.precio_lista === 'true') {
      reasons.push('Tiene lista de precios');
    }

    if (payload.codigo_fabricante && payload.codigo_fabricante.length > 0) {
      reasons.push('Tiene código de fabricante');
    }

    return reasons.length > 0 ? reasons : ['Sin información relevante'];
  };

  // Get category label and style
  const getCategoryInfo = (category?: string) => {
    switch (category) {
      case 'real_duplicate':
        return { label: 'Duplicado Real', bgClass: 'bg-red-100 border-red-300 text-red-800', icon: '🔴' };
      case 'size_variant':
        return { label: 'Variante Tamaño', bgClass: 'bg-amber-100 border-amber-300 text-amber-800', icon: '📏' };
      case 'color_variant':
        return { label: 'Variante Color', bgClass: 'bg-purple-100 border-purple-300 text-purple-800', icon: '🎨' };
      case 'model_variant':
        return { label: 'Variante Modelo', bgClass: 'bg-indigo-100 border-indigo-300 text-indigo-800', icon: '🔢' };
      case 'description_variant':
        return { label: 'Variante Descripción', bgClass: 'bg-cyan-100 border-cyan-300 text-cyan-800', icon: '📝' };
      case 'review_needed':
        return { label: 'Revisar Manualmente', bgClass: 'bg-gray-100 border-gray-300 text-gray-800', icon: '👀' };
      default:
        return { label: 'Sin Clasificar', bgClass: 'bg-orange-100 border-orange-300 text-orange-800', icon: '❓' };
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-6 flex items-start justify-between">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
                <Copy className="h-8 w-8" />
                Detector de Productos Duplicados
              </h2>
              <p className="text-sm md:text-base text-muted-foreground mt-1">
                Encuentra productos duplicados o muy similares usando búsqueda vectorial con IA
              </p>
            </div>
            <Link href="/duplicates/rules">
              <Button variant="outline" size="default">
                <Settings className="mr-2 h-5 w-5" />
                Configurar Reglas
              </Button>
            </Link>
          </div>

          {/* Detection Configuration */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Configuración de Detección</CardTitle>
              <CardDescription>Ajusta los parámetros de búsqueda de duplicados</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="block text-sm font-medium mb-2">Colección</label>
                  <select
                    className="w-full px-3 py-2 border rounded-md"
                    value={selectedCollection}
                    onChange={(e) => setSelectedCollection(e.target.value)}
                  >
                    <option value="">-- Selecciona una colección --</option>
                    {collections?.map((collection: any) => (
                      <option key={collection.id} value={collection.name}>
                        {collection.name} ({collection.totalPoints} productos)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Umbral de Similitud: {similarityThreshold}%
                  </label>
                  <input
                    type="range"
                    min="85"
                    max="99"
                    className="w-full"
                    value={similarityThreshold}
                    onChange={(e) => setSimilarityThreshold(parseInt(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Mayor = más estricto (más similares)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Máximo de grupos
                  </label>
                  <input
                    type="number"
                    min="10"
                    max="200"
                    className="w-full px-3 py-2 border rounded-md"
                    value={maxGroups}
                    onChange={(e) => setMaxGroups(parseInt(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Limita resultados para análisis inicial
                  </p>
                </div>
              </div>

              {/* AI Classification Toggle */}
              <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <input
                  type="checkbox"
                  id="useAiClassification"
                  checked={useAiClassification}
                  onChange={(e) => setUseAiClassification(e.target.checked)}
                  className="w-5 h-5"
                />
                <label htmlFor="useAiClassification" className="text-sm font-medium cursor-pointer flex-1">
                  <span className="text-blue-900">Usar clasificación inteligente con IA (Gemini)</span>
                  <p className="text-xs text-blue-700 mt-1">
                    Categoriza automáticamente los duplicados: reales, variantes de tamaño/color/modelo, etc.
                    <strong className="block mt-1">⚠ Nota: Esto hará la detección más lenta (aprox. 0.5s por grupo)</strong>
                  </p>
                </label>
              </div>

              {/* Filters Section - Optional */}
              <div className="border rounded-lg overflow-hidden">
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    <span className="text-sm font-medium">
                      Filtros Opcionales de Payload {Object.values(filters).some(v => v) && '(activos)'}
                    </span>
                  </div>
                  <span className="text-sm">{showFilters ? '▼' : '▶'}</span>
                </button>

                {showFilters && (
                  <div className="p-4 space-y-3 bg-gray-50/50">
                    <p className="text-xs text-muted-foreground mb-3">
                      Filtra la búsqueda de duplicados por campos específicos del payload.
                      Esto hace la búsqueda más rápida y precisa al enfocarse en productos similares.
                    </p>

                    {loadingFilters ? (
                      <div className="text-center py-4">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-gray-500" />
                        <p className="text-xs text-muted-foreground mt-2">Cargando valores disponibles...</p>
                      </div>
                    ) : (
                      <>
                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <label className="block text-xs font-medium mb-1 text-gray-700">Línea</label>
                            <select
                              className="w-full px-3 py-2 border rounded-md text-sm bg-white"
                              value={filters.linea}
                              onChange={(e) => setFilters({ ...filters, linea: e.target.value })}
                              disabled={!selectedCollection}
                            >
                              <option value="">-- Todos --</option>
                              {availableFilterValues.linea.map((value) => (
                                <option key={value} value={value}>
                                  {value}
                                </option>
                              ))}
                            </select>
                            {availableFilterValues.linea.length === 0 && selectedCollection && (
                              <p className="text-xs text-amber-600 mt-1">No hay valores disponibles</p>
                            )}
                          </div>

                          <div>
                            <label className="block text-xs font-medium mb-1 text-gray-700">Familia</label>
                            <select
                              className="w-full px-3 py-2 border rounded-md text-sm bg-white"
                              value={filters.familia}
                              onChange={(e) => setFilters({ ...filters, familia: e.target.value })}
                              disabled={!selectedCollection}
                            >
                              <option value="">-- Todos --</option>
                              {availableFilterValues.familia.map((value) => (
                                <option key={value} value={value}>
                                  {value}
                                </option>
                              ))}
                            </select>
                            {availableFilterValues.familia.length === 0 && selectedCollection && (
                              <p className="text-xs text-amber-600 mt-1">No hay valores disponibles</p>
                            )}
                          </div>

                          <div>
                            <label className="block text-xs font-medium mb-1 text-gray-700">Sub-Familia</label>
                            <select
                              className="w-full px-3 py-2 border rounded-md text-sm bg-white"
                              value={filters.sub_familia}
                              onChange={(e) => setFilters({ ...filters, sub_familia: e.target.value })}
                              disabled={!selectedCollection}
                            >
                              <option value="">-- Todos --</option>
                              {availableFilterValues.sub_familia.map((value) => (
                                <option key={value} value={value}>
                                  {value}
                                </option>
                              ))}
                            </select>
                            {availableFilterValues.sub_familia.length === 0 && selectedCollection && (
                              <p className="text-xs text-amber-600 mt-1">No hay valores disponibles</p>
                            )}
                          </div>

                          <div>
                            <label className="block text-xs font-medium mb-1 text-gray-700">Categoría</label>
                            <select
                              className="w-full px-3 py-2 border rounded-md text-sm bg-white"
                              value={filters.categoria}
                              onChange={(e) => setFilters({ ...filters, categoria: e.target.value })}
                              disabled={!selectedCollection}
                            >
                              <option value="">-- Todos --</option>
                              {availableFilterValues.categoria.map((value) => (
                                <option key={value} value={value}>
                                  {value}
                                </option>
                              ))}
                            </select>
                            {availableFilterValues.categoria.length === 0 && selectedCollection && (
                              <p className="text-xs text-amber-600 mt-1">No hay valores disponibles</p>
                            )}
                          </div>
                        </div>

                        {Object.values(filters).some(v => v) && (
                          <div className="flex justify-end mt-3">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setFilters({ linea: '', familia: '', sub_familia: '', categoria: '' })}
                            >
                              Limpiar Filtros
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              <Button
                onClick={handleDetect}
                disabled={!selectedCollection || isDetecting}
                className="w-full"
                size="lg"
              >
                {isDetecting ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Analizando productos{useAiClassification ? ' con IA' : ''}... (esto puede tomar varios minutos)
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-5 w-5" />
                    Detectar Duplicados{useAiClassification ? ' con IA' : ''}
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Results Summary */}
          {report && (
            <>
              <Card className="mb-6 border-green-200 bg-green-50/30">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    Resumen del Análisis
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="text-center p-4 bg-white rounded-lg">
                      <div className="text-3xl font-bold text-orange-600">
                        {report.totalGroups}
                      </div>
                      <div className="text-sm text-muted-foreground">Grupos de duplicados</div>
                    </div>
                    <div className="text-center p-4 bg-white rounded-lg">
                      <div className="text-3xl font-bold text-red-600">
                        {report.totalDuplicates}
                      </div>
                      <div className="text-sm text-muted-foreground">Productos duplicados</div>
                    </div>
                    <div className="text-center p-4 bg-white rounded-lg">
                      <div className="text-3xl font-bold text-green-600">
                        {report.estimatedSavings}
                      </div>
                      <div className="text-sm text-muted-foreground">Productos a eliminar</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Category Summary - Only show if AI classification was used */}
              {report.categorySummary && (
                <Card className="mb-6 border-blue-200 bg-blue-50/30">
                  <CardHeader>
                    <CardTitle className="text-lg">Clasificación por IA</CardTitle>
                    <CardDescription>Grupos categorizados automáticamente</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
                      <div className="text-center p-3 bg-red-100 rounded-lg border border-red-300">
                        <div className="text-2xl font-bold text-red-700">
                          {report.categorySummary.real_duplicates}
                        </div>
                        <div className="text-xs text-red-800 font-medium">Duplicados Reales</div>
                      </div>
                      <div className="text-center p-3 bg-amber-100 rounded-lg border border-amber-300">
                        <div className="text-2xl font-bold text-amber-700">
                          {report.categorySummary.size_variants}
                        </div>
                        <div className="text-xs text-amber-800 font-medium">Variantes Tamaño</div>
                      </div>
                      <div className="text-center p-3 bg-purple-100 rounded-lg border border-purple-300">
                        <div className="text-2xl font-bold text-purple-700">
                          {report.categorySummary.color_variants}
                        </div>
                        <div className="text-xs text-purple-800 font-medium">Variantes Color</div>
                      </div>
                      <div className="text-center p-3 bg-indigo-100 rounded-lg border border-indigo-300">
                        <div className="text-2xl font-bold text-indigo-700">
                          {report.categorySummary.model_variants}
                        </div>
                        <div className="text-xs text-indigo-800 font-medium">Variantes Modelo</div>
                      </div>
                      <div className="text-center p-3 bg-cyan-100 rounded-lg border border-cyan-300">
                        <div className="text-2xl font-bold text-cyan-700">
                          {report.categorySummary.description_variants}
                        </div>
                        <div className="text-xs text-cyan-800 font-medium">Variantes Descripción</div>
                      </div>
                      <div className="text-center p-3 bg-gray-100 rounded-lg border border-gray-300">
                        <div className="text-2xl font-bold text-gray-700">
                          {report.categorySummary.review_needed}
                        </div>
                        <div className="text-xs text-gray-800 font-medium">Revisar Manual</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Duplicate Groups */}
              <div className="space-y-4">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <AlertTriangle className="h-6 w-6 text-orange-500" />
                  Grupos de Duplicados Encontrados
                </h3>

                {report.groups.map((group, groupIndex) => {
                  // Get a preview of products in this group
                  const getProductPreview = (product: any) => {
                    const id = product.payload?.id || product.id;
                    const desc = product.payload?.descripcion || product.payload?.description || 'Sin descripción';
                    return { id, desc: String(desc) };
                  };

                  return (
                    <Card key={groupIndex} className="border-orange-200">
                      <CardHeader
                        className="cursor-pointer hover:bg-gray-50"
                        onClick={() =>
                          setExpandedGroup(expandedGroup === groupIndex ? null : groupIndex)
                        }
                      >
                        <div className="flex justify-between items-start gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="space-y-1 mb-2">
                              {group.products.map((product, idx) => {
                                const preview = getProductPreview(product);
                                const isRecommended = product.id === group.recommended.id;
                                return (
                                  <div key={idx} className="flex items-start gap-2 text-sm">
                                    <span className={`font-mono font-bold whitespace-nowrap ${isRecommended ? 'text-green-700' : 'text-red-700'}`}>
                                      {preview.id}
                                    </span>
                                    <span className="text-muted-foreground truncate">
                                      {preview.desc}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-xs mt-2">
                              <span className="text-muted-foreground">
                                Similitud: {(group.avgSimilarity * 100).toFixed(1)}% • {group.duplicateIds.length} duplicados
                              </span>
                              {group.aiClassification && (
                                <>
                                  <span className="text-muted-foreground">•</span>
                                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border text-xs font-medium ${getCategoryInfo(group.aiClassification.category).bgClass}`}>
                                    {getCategoryInfo(group.aiClassification.category).icon}
                                    {getCategoryInfo(group.aiClassification.category).label}
                                  </span>
                                  <span className="text-muted-foreground italic">
                                    ({Math.round(group.aiClassification.confidence * 100)}% confianza)
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                          <Button size="sm" variant="ghost" className="shrink-0">
                            {expandedGroup === groupIndex ? '▼' : '▶'}
                          </Button>
                        </div>
                      </CardHeader>

                    {expandedGroup === groupIndex && (
                      <CardContent>
                        {/* AI Classification Details */}
                        {group.aiClassification && (
                          <div className={`mb-4 p-4 rounded-lg border-2 ${getCategoryInfo(group.aiClassification.category).bgClass}`}>
                            <div className="flex items-start gap-3">
                              <div className="text-2xl">{getCategoryInfo(group.aiClassification.category).icon}</div>
                              <div className="flex-1">
                                <h4 className="font-bold text-sm mb-2">
                                  Análisis de IA: {getCategoryInfo(group.aiClassification.category).label}
                                </h4>
                                <p className="text-sm mb-2">
                                  <strong>Razón:</strong> {group.aiClassification.reason}
                                </p>
                                {group.aiClassification.differences && group.aiClassification.differences.length > 0 && (
                                  <div className="text-sm">
                                    <strong>Diferencias encontradas:</strong>
                                    <ul className="list-disc list-inside ml-2 mt-1">
                                      {group.aiClassification.differences.map((diff, i) => (
                                        <li key={i}>{diff}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                                <p className="text-xs mt-2 italic">
                                  Recomendación: <strong>{group.aiClassification.recommendation === 'merge' ? 'Fusionar/Eliminar duplicados' : group.aiClassification.recommendation === 'keep_both' ? 'Mantener ambos productos' : 'Revisar manualmente'}</strong>
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Comparison Grid - Side by Side */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          {/* Recommended Product - LEFT COLUMN */}
                          <div className="p-4 border-2 border-green-500 rounded-lg bg-green-50">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-5 w-5 text-green-600" />
                                <span className="font-bold text-green-900 text-sm">
                                  PRODUCTO RECOMENDADO
                                </span>
                              </div>
                            </div>

                            {/* ID Clickeable */}
                            <div className="mb-3">
                              <button
                                onClick={() => copyToClipboard(group.recommended.payload?.id || String(group.recommended.id))}
                                className="flex items-center gap-2 px-3 py-2 bg-white border-2 border-green-300 rounded hover:bg-green-50 transition-colors group w-full"
                                title="Haz click para copiar el ID"
                              >
                                <span className="text-xs text-muted-foreground font-medium">ID:</span>
                                <span className="font-mono font-bold text-green-700 flex-1 text-left">
                                  {group.recommended.payload?.id || group.recommended.id}
                                </span>
                                <Copy className="h-4 w-4 text-green-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </button>
                              {copiedId === (group.recommended.payload?.id || String(group.recommended.id)) && (
                                <div className="text-xs text-green-600 mt-1 font-medium animate-pulse">
                                  ✓ ID copiado al portapapeles
                                </div>
                              )}
                            </div>

                            <div className="text-xs space-y-1 bg-white p-3 rounded border border-green-200 max-h-96 overflow-y-auto">
                              {getImportantFields(group.recommended.payload).map(([key, value]) => (
                                <div key={key} className="flex py-1 border-b border-gray-100 last:border-0">
                                  <span className="text-muted-foreground min-w-[120px] font-semibold">
                                    {key}:
                                  </span>
                                  <span className="font-medium break-all">{String(value)}</span>
                                </div>
                              ))}
                            </div>

                            <div className="mt-3 pt-3 border-t border-green-200">
                              <div className="text-xs font-medium text-green-900 mb-2">
                                ¿Por qué este producto?
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {getScoreReason(group.recommended).map((reason, i) => (
                                  <span
                                    key={i}
                                    className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 rounded text-xs"
                                  >
                                    <CheckCircle2 className="h-3 w-3" />
                                    {reason}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* Duplicate Products - RIGHT COLUMN(S) */}
                          <div className="space-y-4">
                            <div className="text-sm font-medium text-red-600 mb-2 flex items-center gap-2">
                              <AlertTriangle className="h-4 w-4" />
                              Productos duplicados ({group.duplicateIds.length})
                            </div>
                            {group.products
                              .filter((p) => p.id !== group.recommended.id)
                              .map((product, idx) => (
                                <div
                                  key={idx}
                                  className="p-4 border-2 border-red-300 rounded-lg bg-red-50/30"
                                >
                                  <div className="flex justify-between items-start mb-3">
                                    <span className="text-xs text-muted-foreground font-medium">
                                      Similitud: {(product.score * 100).toFixed(1)}%
                                    </span>
                                  </div>

                                  {/* ID Clickeable */}
                                  <div className="mb-3">
                                    <button
                                      onClick={() => copyToClipboard(product.payload?.id || String(product.id))}
                                      className="flex items-center gap-2 px-3 py-2 bg-white border-2 border-red-300 rounded hover:bg-red-50 transition-colors group w-full"
                                      title="Haz click para copiar el ID"
                                    >
                                      <span className="text-xs text-muted-foreground font-medium">ID:</span>
                                      <span className="font-mono font-bold text-red-700 flex-1 text-left">
                                        {product.payload?.id || product.id}
                                      </span>
                                      <Copy className="h-4 w-4 text-red-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </button>
                                    {copiedId === (product.payload?.id || String(product.id)) && (
                                      <div className="text-xs text-red-600 mt-1 font-medium animate-pulse">
                                        ✓ ID copiado al portapapeles
                                      </div>
                                    )}
                                  </div>

                                  <div className="text-xs space-y-1 bg-white p-3 rounded border border-red-200 max-h-96 overflow-y-auto">
                                    {getImportantFields(product.payload).map(([key, value]) => (
                                      <div key={key} className="flex py-1 border-b border-gray-100 last:border-0">
                                        <strong className="text-muted-foreground min-w-[120px] font-semibold">{key}:</strong>
                                        <span className="break-all">{String(value)}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      </CardContent>
                    )}
                    </Card>
                  );
                })}
              </div>
            </>
          )}

          {/* Empty State */}
          {!report && !isDetecting && (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Copy className="h-16 w-16 text-muted-foreground opacity-50 mb-4" />
                <p className="text-muted-foreground text-center">
                  Selecciona una colección y haz clic en &quot;Detectar Duplicados&quot; para comenzar el análisis
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
