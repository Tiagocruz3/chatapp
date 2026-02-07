/**
 * OpenRouter Model Selection Utility
 * 
 * Provides intelligent model selection based on agent requirements,
 * with caching and fallback mechanisms.
 */

// Default fallback model if API fails
const DEFAULT_FALLBACK_MODEL = 'anthropic/claude-3.5-sonnet';

// Model tiers for different use cases
const MODEL_TIERS = {
  // Premium models for complex reasoning, security, architecture
  PREMIUM: [
    'anthropic/claude-3-opus',
    'openai/gpt-4o',
    'google/gemini-1.5-pro',
    'meta-llama/llama-3.1-405b'
  ],
  // Standard high-quality models for most agents
  STANDARD: [
    'anthropic/claude-3.5-sonnet',
    'openai/gpt-4o-mini',
    'google/gemini-1.5-flash',
    'meta-llama/llama-3.1-70b'
  ],
  // Fast, cost-effective models for simpler tasks
  FAST: [
    'anthropic/claude-3-haiku',
    'openai/gpt-4o-mini',
    'google/gemini-1.5-flash',
    'mistralai/mistral-7b-instruct'
  ]
};

// Domain-specific model preferences
const DOMAIN_MODEL_MAPPING = {
  coding: ['anthropic/claude-3.5-sonnet', 'openai/gpt-4o', 'anthropic/claude-3-opus'],
  security: ['anthropic/claude-3-opus', 'anthropic/claude-3.5-sonnet'],
  architecture: ['anthropic/claude-3-opus', 'anthropic/claude-3.5-sonnet', 'openai/gpt-4o'],
  ml: ['anthropic/claude-3.5-sonnet', 'anthropic/claude-3-opus', 'openai/gpt-4o'],
  creative: ['anthropic/claude-3.5-sonnet', 'openai/gpt-4o', 'google/gemini-1.5-pro'],
  writing: ['anthropic/claude-3.5-sonnet', 'openai/gpt-4o-mini'],
  analysis: ['anthropic/claude-3.5-sonnet', 'openai/gpt-4o', 'google/gemini-1.5-pro']
};

// Cache for model list
let modelCache = null;
let modelCacheTimestamp = null;
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch available models from OpenRouter
 * @param {string} apiKey - OpenRouter API key
 * @returns {Promise<Array>} - List of available models
 */
export async function fetchOpenRouterModels(apiKey) {
  // Return cached models if still valid
  if (modelCache && modelCacheTimestamp && 
      (Date.now() - modelCacheTimestamp) < CACHE_DURATION_MS) {
    console.log('Using cached model list');
    return modelCache;
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: apiKey ? {
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': window.location.origin,
        'X-Title': 'ChatApp Agents'
      } : {}
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status}`);
    }

    const data = await response.json();
    const models = data.data || [];
    
    // Process and enrich model data
    const processedModels = models.map(model => ({
      id: model.id,
      name: model.name || model.id,
      description: model.description,
      context_length: model.context_length || 4096,
      pricing: {
        prompt: model.pricing?.prompt || 0,
        completion: model.pricing?.completion || 0
      },
      // Calculate approximate cost per 1K tokens
      costPer1K: ((model.pricing?.prompt || 0) + (model.pricing?.completion || 0)) * 1000
    }));

    // Cache the results
    modelCache = processedModels;
    modelCacheTimestamp = Date.now();
    
    return processedModels;
  } catch (error) {
    console.error('Error fetching OpenRouter models:', error);
    return null;
  }
}

/**
 * Select the best model for an agent
 * @param {Object} agent - Agent profile
 * @param {Array} availableModels - List of available models from OpenRouter
 * @returns {Object} - Selected model details
 */
export function selectBestModel(agent, availableModels = null) {
  // If agent has a preferred model, try to use it
  if (agent.defaultModel) {
    // If we have available models, verify the preferred one exists
    if (availableModels) {
      const preferredExists = availableModels.find(m => m.id === agent.defaultModel);
      if (preferredExists) {
        return {
          modelId: agent.defaultModel,
          rationale: agent.modelRationale || 'Agent preferred model',
          isFallback: false
        };
      }
    } else {
      // No available models list, trust the agent's default
      return {
        modelId: agent.defaultModel,
        rationale: agent.modelRationale || 'Agent preferred model',
        isFallback: false
      };
    }
  }

  // If preferred model not available, select based on category
  const category = agent.category;
  const domainModels = DOMAIN_MODEL_MAPPING[category] || DOMAIN_MODEL_MAPPING.analysis;
  
  if (availableModels) {
    // Find first available model from domain preferences
    for (const modelId of domainModels) {
      const found = availableModels.find(m => m.id === modelId);
      if (found) {
        return {
          modelId: modelId,
          rationale: `Selected based on ${category} domain requirements`,
          isFallback: false
        };
      }
    }
  }

  // Ultimate fallback
  return {
    modelId: DEFAULT_FALLBACK_MODEL,
    rationale: 'Fallback model - preferred models not available',
    isFallback: true
  };
}

/**
 * Get model details by ID
 * @param {string} modelId - Model identifier
 * @param {Array} availableModels - List of available models
 * @returns {Object|null} - Model details or null
 */
export function getModelDetails(modelId, availableModels = null) {
  if (!availableModels) {
    return {
      id: modelId,
      name: modelId.split('/').pop(),
      context_length: 4096
    };
  }
  
  return availableModels.find(m => m.id === modelId) || null;
}

/**
 * Calculate estimated cost for a request
 * @param {string} modelId - Model identifier
 * @param {number} inputTokens - Input token count
 * @param {number} outputTokens - Output token count
 * @param {Array} availableModels - List of available models with pricing
 * @returns {number} - Estimated cost in USD
 */
export function estimateCost(modelId, inputTokens, outputTokens, availableModels = null) {
  if (!availableModels) return null;
  
  const model = availableModels.find(m => m.id === modelId);
  if (!model || !model.pricing) return null;
  
  const inputCost = (inputTokens / 1000) * (model.pricing.prompt || 0) * 1000;
  const outputCost = (outputTokens / 1000) * (model.pricing.completion || 0) * 1000;
  
  return inputCost + outputCost;
}

/**
 * Get recommended models for a specific use case
 * @param {string} useCase - Use case category
 * @param {Array} availableModels - Available models
 * @returns {Array} - Recommended models with reasons
 */
export function getRecommendedModels(useCase, availableModels = null) {
  const recommendations = [];
  const modelList = availableModels || [];
  
  const tiers = ['PREMIUM', 'STANDARD', 'FAST'];
  
  tiers.forEach(tier => {
    MODEL_TIERS[tier].forEach(modelId => {
      const model = modelList.find(m => m.id === modelId);
      if (model || !availableModels) {
        recommendations.push({
          modelId: modelId,
          tier: tier,
          name: model?.name || modelId,
          context_length: model?.context_length || 4096,
          costPer1K: model?.costPer1K || 'unknown'
        });
      }
    });
  });
  
  return recommendations;
}

/**
 * Check if a model supports tool calling
 * @param {string} modelId - Model identifier
 * @returns {boolean} - Whether tools are supported
 */
export function supportsTools(modelId) {
  // Models known to support function calling/tools
  const toolEnabledModels = [
    'anthropic/claude-3-opus',
    'anthropic/claude-3.5-sonnet',
    'anthropic/claude-3-haiku',
    'openai/gpt-4o',
    'openai/gpt-4o-mini',
    'openai/gpt-4-turbo',
    'google/gemini-1.5-pro',
    'google/gemini-1.5-flash'
  ];
  
  return toolEnabledModels.some(m => modelId.includes(m));
}

/**
 * Clear the model cache
 */
export function clearModelCache() {
  modelCache = null;
  modelCacheTimestamp = null;
}

/**
 * Get model capabilities summary
 * @param {string} modelId - Model identifier
 * @returns {Object} - Capabilities summary
 */
export function getModelCapabilities(modelId) {
  const capabilities = {
    tools: supportsTools(modelId),
    vision: modelId.includes('claude-3') || 
            modelId.includes('gpt-4o') || 
            modelId.includes('gemini'),
    jsonMode: modelId.includes('gpt-4') || 
              modelId.includes('claude-3') ||
              modelId.includes('gemini'),
    streaming: true // Most modern models support streaming
  };
  
  return capabilities;
}

export default {
  fetchOpenRouterModels,
  selectBestModel,
  getModelDetails,
  estimateCost,
  getRecommendedModels,
  supportsTools,
  clearModelCache,
  getModelCapabilities,
  MODEL_TIERS,
  DEFAULT_FALLBACK_MODEL
};
