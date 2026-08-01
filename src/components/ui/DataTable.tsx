'use client';

import React, { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, Search } from 'lucide-react';

interface Column {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (value: any, row: any) => React.ReactNode;
}

interface DataTableProps {
  columns: Column[];
  data: any[];
  itemsPerPage?: number;
  searchable?: boolean;
  className?: string;
}

const DataTable: React.FC<DataTableProps> = ({
  columns,
  data,
  itemsPerPage = 10,
  searchable = true,
  className = ''
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Filter data based on search term
  const filteredData = useMemo(() => {
    if (!searchTerm) return data;
    
    return data.filter(row =>
      Object.values(row).some(value =>
        String(value).toLowerCase().includes(searchTerm.toLowerCase())
      )
    );
  }, [data, searchTerm]);

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortColumn) return filteredData;
    
    return [...filteredData].sort((a, b) => {
      const aValue = a[sortColumn];
      const bValue = b[sortColumn];
      
      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredData, sortColumn, sortDirection]);

  // Paginate data
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return sortedData.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedData, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(sortedData.length / itemsPerPage);

  const handleSort = (columnKey: string) => {
    if (sortColumn === columnKey) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(columnKey);
      setSortDirection('asc');
    }
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  return (
    <div className={`overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm ${className}`}>
      {/* Table Header with Search */}
      {searchable && (
        <div className="border-b border-border bg-muted/20 p-3 sm:p-4">
          <div className="flex items-center">
            {searchable && (
              <div className="relative w-full sm:max-w-sm">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground/70" />
                <input
                  type="search"
                  aria-label="Search records"
                  placeholder="Search records"
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                  className="min-h-11 w-full rounded-xl border border-input bg-background py-2.5 pl-10 pr-4 text-base shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15 sm:text-sm"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-background">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  aria-sort={sortColumn === column.key ? (sortDirection === 'asc' ? 'ascending' : 'descending') : undefined}
                  className="px-5 py-2 text-left text-xs font-semibold text-muted-foreground"
                >
                  <button
                    type="button"
                    disabled={!column.sortable}
                    onClick={() => column.sortable && handleSort(column.key)}
                    className="flex min-h-9 w-full items-center gap-1 rounded-lg text-left disabled:cursor-default"
                  >
                    <span>{column.label}</span>
                    {column.sortable && sortColumn === column.key && (
                      sortDirection === 'asc' ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-card divide-y divide-border">
            {paginatedData.map((row, index) => (
              <tr key={index} className="hover:bg-background">
                {columns.map((column) => (
                  <td key={column.key} className="px-5 py-3.5 whitespace-nowrap text-sm text-foreground">
                    {column.render 
                      ? column.render(row[column.key], row)
                      : row[column.key]
                    }
                  </td>
                ))}
              </tr>
            ))}
            {paginatedData.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-5 py-12 text-center text-sm text-muted-foreground">
                  No records match your search.
                </td>
              </tr>
            )}

          </tbody>
        </table>
      </div>

      <div className="divide-y divide-border md:hidden">
        {paginatedData.map((row, rowIndex) => (
          <article key={rowIndex} className="space-y-3 p-4 active:bg-muted/40">
            {columns.map((column) => (
              <div key={column.key} className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-3 text-sm">
                <span className="font-semibold text-muted-foreground">{column.label}</span>
                <span className="min-w-0 break-words text-right text-foreground">
                  {column.render ? column.render(row[column.key], row) : row[column.key]}
                </span>
              </div>
            ))}
          </article>
        ))}
        {paginatedData.length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground">No records match your search.</p>
        )}

      </div>
      {/* Pagination */}
      {totalPages > 1 && (
        <div className="border-t border-border bg-muted/10 px-4 py-3 sm:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="text-center text-xs text-foreground/80 lg:text-left sm:text-sm">
              Showing {((currentPage - 1) * itemsPerPage) + 1} to{' '}
              {Math.min(currentPage * itemsPerPage, sortedData.length)} of{' '}
              {sortedData.length} results
            </div>
            
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="min-h-10 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <span className="min-w-20 text-center text-xs font-semibold tabular-nums text-muted-foreground">
                Page {currentPage} of {totalPages}
              </span>
              
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="min-h-10 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataTable; 