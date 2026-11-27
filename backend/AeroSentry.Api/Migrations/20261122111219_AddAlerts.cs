using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AeroSentry.Api.Migrations;

/// <inheritdoc />
public partial class _20261122111219_AddAlerts : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "Alerts",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                Number = table.Column<int>(type: "int", nullable: false)
                    .Annotation("SqlServer:Identity", "1, 1"),
                DetectionEventId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                PropertyId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                WallId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                CellId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                CellLabel = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true),
                Probability = table.Column<double>(type: "float", nullable: false),
                Status = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_Alerts", x => x.Id);
                table.ForeignKey(
                    name: "FK_Alerts_DetectionEvents_DetectionEventId",
                    column: x => x.DetectionEventId,
                    principalTable: "DetectionEvents",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
                table.ForeignKey(
                    name: "FK_Alerts_Properties_PropertyId",
                    column: x => x.PropertyId,
                    principalTable: "Properties",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Restrict);
                table.ForeignKey(
                    name: "FK_Alerts_Walls_WallId",
                    column: x => x.WallId,
                    principalTable: "Walls",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Restrict);
            });

        migrationBuilder.CreateIndex(
            name: "IX_Alerts_DetectionEventId",
            table: "Alerts",
            column: "DetectionEventId",
            unique: true);

        migrationBuilder.CreateIndex(
            name: "IX_Alerts_Number",
            table: "Alerts",
            column: "Number",
            unique: true);

        migrationBuilder.CreateIndex(
            name: "IX_Alerts_PropertyId_CreatedAtUtc",
            table: "Alerts",
            columns: new[] { "PropertyId", "CreatedAtUtc" });

        migrationBuilder.CreateIndex(
            name: "IX_Alerts_WallId",
            table: "Alerts",
            column: "WallId");
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "Alerts");
    }
}
