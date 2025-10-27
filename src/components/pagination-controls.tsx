'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  basePath: string;
}

const PaginationControls = ({ currentPage, totalPages, basePath }: PaginationControlsProps) => {
  const searchParams = useSearchParams();

  const createPageURL = (pageNumber: number) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', pageNumber.toString());
    return `${basePath}?${params.toString()}`;
  };

  const pageNumbers = [];
  for (let i = 1; i <= totalPages; i++) {
    pageNumbers.push(i);
  }

  return (
    <div className="flex justify-center items-center space-x-2">
      {currentPage > 1 && (
        <Link href={createPageURL(currentPage - 1)} className="px-4 py-2 border rounded-md hover:bg-gray-800">
          Previous
        </Link>
      )}

      {pageNumbers.map((number) => (
        <Link
          key={number}
          href={createPageURL(number)}
          className={`px-4 py-2 border rounded-md ${currentPage === number ? 'bg-primary text-primary-foreground' : 'hover:bg-gray-800'}`}>
          {number}
        </Link>
      ))}

      {currentPage < totalPages && (
        <Link href={createPageURL(currentPage + 1)} className="px-4 py-2 border rounded-md hover:bg-gray-800">
          Next
        </Link>
      )}
    </div>
  );
};

export default PaginationControls;
