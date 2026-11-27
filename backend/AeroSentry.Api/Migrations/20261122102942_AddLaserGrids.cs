using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AeroSentry.Api.Migrations;

/// <inheritdoc />
public partial class _20261122102942_AddLaserGrids : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "LaserGrids",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                PropertyId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                Rows = table.Column<int>(type: "int", nullable: false),
                Columns = table.Column<int>(type: "int", nullable: false),
                SquareSizeMeters = table.Column<double>(type: "float", nullable: false),
                CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_LaserGrids", x => x.Id);
                table.ForeignKey(
                    name: "FK_LaserGrids_Properties_PropertyId",
                    column: x => x.PropertyId,
                    principalTable: "Properties",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex(
            name: "IX_LaserGrids_PropertyId_Name",
            table: "LaserGrids",
            columns: new[] { "PropertyId", "Name" },
            unique: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "LaserGrids");
    }
}
