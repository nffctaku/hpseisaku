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
        <Link href={createPageURL(currentPage - 1)} className="px-4 py-2 border rounded-md bg-white text-gray-900 hover:bg-gray-100">
          Previous
        </Link>
      )}

      {pageNumbers.map((number) => (
        <Link
          key={number}
          href={createPageURL(number)}
          className={`px-4 py-2 border rounded-md ${currentPage === number ? 'bg-white text-gray-900 font-semibold border-gray-900' : 'bg-white text-gray-900 hover:bg-gray-100'}`}>
          {number}
        </Link>
      ))}

      {currentPage < totalPages && (
        <Link href={createPageURL(currentPage + 1)} className="px-4 py-2 border rounded-md bg-white text-gray-900 hover:bg-gray-100">
          Next
        </Link>
      )}
    </div>
  );
};

export default PaginationControls;
