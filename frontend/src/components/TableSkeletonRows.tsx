import { Skeleton, TableCell, TableRow } from '@mui/material';

interface Props {
  columns: number;
  rows?: number;
}

export function TableSkeletonRows({ columns, rows = 4 }: Props) {
  return (
    <>
      {Array.from({ length: rows }).map((_, fila) => (
        <TableRow key={fila}>
          {Array.from({ length: columns }).map((_, columna) => (
            <TableCell key={columna}>
              <Skeleton variant="text" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}
