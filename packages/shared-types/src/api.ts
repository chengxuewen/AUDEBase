/**
 * API 响应信封 + 分页 Meta
 *
 * @audebase/shared-types
 */

import { ErrorCode } from './errors.js'

/**
 * API 列表响应信封（NocoBase 分页格式）
 */
export interface ApiListResponse<T> {
  data: T[]
  meta: PaginationMeta
}

/**
 * 分页元数据
 */
export interface PaginationMeta {
  /** 符合条件的总记录数 */
  count: number
  /** 当前页码（1-based） */
  page: number
  /** 每页条数 */
  pageSize: number
  /** 总页数 = ceil(count / pageSize) */
  totalPages: number
}

/**
 * API 错误响应信封
 */
export interface ApiErrorResponse {
  error: {
    code: ErrorCode
    message: string
    details?: Record<string, unknown>
  }
}

/**
 * API 分页查询参数
 *
 * ProTable 兼容：前端 current/pageSize -> 后端 page/pageSize
 */
export interface PaginationParams {
  page?: number
  pageSize?: number
}

/**
 * API 排序参数（Directus 前缀格式）
 * 单字段: "created_at"（升序）或 "-created_at"（降序）
 * 多字段: "-created_at,username"
 */
export type SortParam = string

/**
 * API 过滤操作符
 */
export type FilterOperator =
  | '$eq'
  | '$ne'
  | '$gt'
  | '$gte'
  | '$lt'
  | '$lte'
  | '$in'
  | '$nin'
  | '$includes'
  | '$startsWith'
  | '$null'

/**
 * 过滤条件（NocoBase 风格 filter JSON）
 */
export type FilterCondition = Record<string, unknown>
