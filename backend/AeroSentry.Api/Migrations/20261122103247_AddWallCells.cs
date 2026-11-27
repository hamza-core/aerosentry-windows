using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AeroSentry.Api.Migrations;

/// <inheritdoc />
public partial class _20261122103247_AddWallCells : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "WallCells",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                WallId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                Label = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                Position = table.Column<int>(type: "int", nullable: false),
                LengthMeters = table.Column<double>(type: "float", nullable: false),
                CornersJson = table.Column<string>(type: "nvarchar(max)", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_WallCells", x => x.Id);
                table.ForeignKey(
                    name: "FK_WallCells_Walls_WallId",
                    column: x => x.WallId,
                    principalTable: "Walls",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex(
            name: "IX_WallCells_WallId_Label",
            table: "WallCells",
            columns: new[] { "WallId", "Label" },
            unique: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "WallCells");
    }
}
