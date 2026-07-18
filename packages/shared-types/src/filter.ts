import type { SortParam, FilterCondition } from "./api";

/**
 * 列表查询通用参数
 */
export interface ListQueryParams {
  page?: number;
  pageSize?: number;
  sort?: SortParam;
  filter?: FilterCondition;
}
