using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AeroSentry.Api.Migrations;

/// <inheritdoc />
public partial class _20261122103523_AddWallCellRoutes : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "WallCellSquares",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                WallCellId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                LaserGridId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                Order = table.Column<int>(type: "int", nullable: false),
                Row = table.Column<int>(type: "int", nullable: false),
                Col = table.Column<int>(type: "int", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_WallCellSquares", x => x.Id);
                table.ForeignKey(
                    name: "FK_WallCellSquares_LaserGrids_LaserGridId",
                    column: x => x.LaserGridId,
                    principalTable: "LaserGrids",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Restrict);
                table.ForeignKey(
                    name: "FK_WallCellSquares_WallCells_WallCellId",
                    column: x => x.WallCellId,
                    principalTable: "WallCells",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex(
            name: "IX_WallCellSquares_LaserGridId_Row_Col",
            table: "WallCellSquares",
            columns: new[] { "LaserGridId", "Row", "Col" },
            unique: true);

        migrationBuilder.CreateIndex(
            name: "IX_WallCellSquares_WallCellId_Order",
            table: "WallCellSquares",
            columns: new[] { "WallCellId", "Order" },
            unique: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "WallCellSquares");
    }
}
