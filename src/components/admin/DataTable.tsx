"use client";
import { useState } from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
export function DataTable<T>({
  rows,
  columns,
  empty,
}: {
  rows: T[];
  columns: ColumnDef<T, any>[];
  empty: string;
}) {
  const [globalFilter, setGlobalFilter] = useState("");
  const table = useReactTable({
    data: rows,
    columns,
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });
  return (
    <div className="admin-table-panel">
      <label className="admin-search">
        <span className="sr-only">Search content</span>
        <Input
          type="search"
          placeholder="Search content…"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
        />
      </label>
      <div className="admin-table-scroll">
        <table>
          <thead>
            {table.getHeaderGroups().map((h) => (
              <tr key={h.id}>
                {h.headers.map((c) => (
                  <th key={c.id}>
                    {flexRender(c.column.columnDef.header, c.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!table.getFilteredRowModel().rows.length && (
          <div className="admin-empty">
            <h2>{rows.length ? "No matching content" : empty}</h2>
            <p>
              {rows.length
                ? "Try a different search."
                : "Use the add button to get started."}
            </p>
          </div>
        )}
      </div>
      {rows.length > 10 && (
        <div className="admin-pagination">
          <Button
            variant="outline"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
          >
            Previous
          </Button>
          <span>
            Page {table.getState().pagination.pageIndex + 1} of{" "}
            {table.getPageCount()}
          </span>
          <Button
            variant="outline"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
