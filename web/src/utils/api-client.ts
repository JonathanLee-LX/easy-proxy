/**
 * Centralized API client with consistent error handling
 */

export interface ApiResponse<T = any> {
  status: string
  data?: T
  error?: string
}

/**
 * Base fetch wrapper with error handling
 */
async function apiRequest<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  try {
    const response = await fetch(url, options)
    
    // For non-JSON responses (like raw text)
    if (options?.headers && 
        typeof options.headers === 'object' &&
        !('Content-Type' in options.headers)) {
      const text = await response.text()
      return text as T
    }
    
    const data = await response.json()
    return data as T
  } catch (error) {
    console.error(`API request failed for ${url}:`, error)
    throw error
  }
}

/**
 * GET request
 */
export async function apiGet<T>(url: string): Promise<T> {
  return apiRequest<T>(url)
}

/**
 * POST request
 */
export async function apiPost<T>(
  url: string,
  body?: any,
  contentType: string = 'application/json'
): Promise<T> {
  return apiRequest<T>(url, {
    method: 'POST',
    headers: contentType ? { 'Content-Type': contentType } : undefined,
    body: contentType === 'application/json' ? JSON.stringify(body) : body,
  })
}

/**
 * PUT request
 */
export async function apiPut<T>(
  url: string,
  body?: any,
  contentType: string = 'application/json'
): Promise<T> {
  return apiRequest<T>(url, {
    method: 'PUT',
    headers: contentType ? { 'Content-Type': contentType } : undefined,
    body: contentType === 'application/json' ? JSON.stringify(body) : body,
  })
}

/**
 * DELETE request
 */
export async function apiDelete<T>(url: string): Promise<T> {
  return apiRequest<T>(url, {
    method: 'DELETE',
  })
}

/**
 * Check if API response is successful
 */
export function isSuccessResponse(response: ApiResponse): boolean {
  return response.status === 'success'
}
