/**
 * 过滤/排序工具类型
 *
 * @audebase/shared-types
 */

import { SortParam, FilterCondition } from './api.js'

/**
 * 列表查询通用参数
 */
export interface ListQueryParams {
  page?: number
  pageSize?: number
  sort?: SortParam
  filter?: FilterCondition
}
