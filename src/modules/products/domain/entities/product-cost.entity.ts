export class ProductCostEntity {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly sku: string,
    public readonly productName: string,
    public readonly costUnitary: number,
    public readonly currency: string,
    public readonly sourceFileName: string,
    public readonly importedAt: Date,
    public readonly createdAt: Date,
    public readonly updatedAt: Date
  ) {}
}
